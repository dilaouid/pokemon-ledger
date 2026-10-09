const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const hre = require('hardhat');
const { createPublicClient, createWalletClient, custom, parseEventLogs } = require('viem');
const { hardhat } = require('viem/chains');

// Execute the actual frontend derivation, not a second test-only copy.
const source = fs.readFileSync(path.resolve(__dirname, '../../src/domain/deriveStarter.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const domain = {};
new Function('require', 'exports', compiled)(require, domain);

const rules = {};
new Function('require', 'exports', ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../../src/domain/battleRules.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(require, rules);

describe('LedgerMon', function () {
    this.timeout(60000);
    let client, wallet, account, other, address, abi;
    const read = (functionName, args = []) => client.readContract({ address, abi, functionName, args });
    const send = async (functionName, args = [], from = account) => {
        const hash = await wallet.writeContract({ address, abi, functionName, args, account: from });
        return client.waitForTransactionReceipt({ hash });
    };
    const win = async (id) => {
        if (id === 2) return send('claimDiyaeddineReward', ['YOU LOSE IMMEDIATLY']);
        for (let i = 0; i < 100; i++) {
            const receipt = await send('battle', [id, i % 2]);
            const event = parseEventLogs({ abi, logs: receipt.logs, eventName: 'BattleResolved' })[0];
            if (event.args.won) return receipt;
        }
        assert.fail('No victory after 100 attempts');
    };
    beforeEach(async () => {
        await hre.network.provider.request({ method: 'hardhat_reset', params: [] });
        const transport = custom(hre.network.provider);
        client = createPublicClient({ chain: hardhat, transport });
        wallet = createWalletClient({ chain: hardhat, transport });
        [account, other] = await wallet.getAddresses();
        const artifact = await hre.artifacts.readArtifact('LedgerMon');
        abi = artifact.abi;
        const receipt = await client.waitForTransactionReceipt({ hash: await wallet.deployContract({ abi, bytecode: artifact.bytecode, account }) });
        address = receipt.contractAddress;
    });

    it('matches TypeScript derivation for varied addresses', async () => {
        const addresses = [...await wallet.getAddresses(), '0x0000000000000000000000000000000000000000', '0xffffffffffffffffffffffffffffffffffffffff'];
        for (const player of addresses) {
            const expected = domain.deriveStarter(player);
            const actual = await read('deriveStarter', [player]);
            assert.deepEqual(actual, [expected.speciesId, expected.attack, expected.defense]);
        }
    });

    it('matches the friendly frontend odds for every opponent and strategy', async () => {
        for (const player of await wallet.getAddresses()) {
            const { attack, defense } = domain.deriveStarter(player);
            for (let id = 0; id <= 13; id++) {
                for (const strategy of [0, 1]) {
                    assert.equal(await read('victoryChance', [player, id, strategy]), rules.victoryChance(attack, defense, id, strategy));
                }
            }
        }
    });

    it('claims once, isolates identities and binds starters to their address', async () => {
        const receipt = await send('claimStarter');
        assert.equal(parseEventLogs({ abi, logs: receipt.logs, eventName: 'StarterClaimed' }).length, 1);
        assert.deepEqual(await read('getPlayer', [account]), [1n, 0, false]);
        assert.deepEqual(await read('getPlayer', [other]), [0n, 0, false]);
        await assert.rejects(send('claimStarter'), /AlreadyClaimed/);
        await assert.rejects(send('transferFrom', [account, other, 1n]), /StarterBoundToPlayer/);
        await send('claimStarter', [], other);
        assert.equal(await read('ownerOf', [2n]), other);
        const uri = await read('tokenURI', [1n]);
        const metadata = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString());
        assert.match(metadata.image, /^data:image\/svg\+xml;base64,/);
        assert.equal(metadata.attributes[0].value, 'Starter');
    });

    it('validates battle inputs, starter ownership and boss lock', async () => {
        await assert.rejects(send('battle', [0, 0]), /StarterRequired/);
        await send('claimStarter');
        await assert.rejects(send('battle', [14, 0]), /InvalidOpponent/);
        await assert.rejects(send('battle', [0, 2]), /InvalidStrategy/);
        await assert.rejects(send('battle', [13, 0]), /BossLocked/);
        const starter = domain.deriveStarter(account);
        assert.equal(await read('victoryChance', [account, 0, 0]), Math.min(95, 60 + Math.floor(starter.attack / 2)));
        assert.equal(await read('victoryChance', [account, 0, 1]), Math.min(95, 60 + Math.floor(starter.defense / 2)));
    });

    it('allows losses to be retried without granting rewards', async () => {
        await send('claimStarter');
        let lost = false;
        for (let id = 0; id < 13 && !lost; id++) {
            if (id === 2) continue;
            const before = await read('getPlayer', [account]);
            const supply = await read('nextTokenId');
            const receipt = await send('battle', [id, 0]);
            const event = parseEventLogs({ abi, logs: receipt.logs, eventName: 'BattleResolved' })[0];
            if (!event.args.won) {
                lost = true;
                assert.deepEqual(await read('getPlayer', [account]), before);
                assert.equal(await read('nextTokenId'), supply);
                await win(id);
            }
        }
        assert.ok(lost, 'Expected at least one loss across 13 deterministic test battles');
    });

    it('requires the warning answer and restricts portrait updates to the deployer', async () => {
        await assert.rejects(send('claimDiyaeddineReward', ['YOU LOSE IMMEDIATLY']), /StarterRequired/);
        await send('claimStarter');
        await assert.rejects(send('battle', [2, 0]), /SecurityChallengeRequired/);
        await assert.rejects(send('claimDiyaeddineReward', ['wrong']), /IncorrectWarning/);
        await assert.rejects(send('setTrainerImageBaseURI', ['https://example.com/nft/'], other), /MetadataAdminOnly/);
        await assert.rejects(send('setTrainerImageBaseURI', ['https://example.com/nft']), /InvalidImageURI/);
        await assert.rejects(send('setTrainerImageBaseURI', ['https://example.com/"/']), /InvalidImageURI/);
        await send('setTrainerImageBaseURI', ['ipfs://bafyExample/']);
        await win(2);
        const token = await read('trophyOf', [account, 2]);
        const metadata = JSON.parse(Buffer.from((await read('tokenURI', [token])).split(',')[1], 'base64').toString());
        assert.equal(metadata.image, 'ipfs://bafyExample/diyaeddine.png');
        assert.equal(await read('trainerImage', [13]), 'ipfs://bafyExample/panoramix.svg');
        assert.equal((await read('getPlayer', [account]))[1], 4);
        await assert.rejects(win(2), /AlreadyDefeated/);
    });

    it('mints unique trophies, preserves progression on transfer and unlocks Panoramix', async () => {
        await send('claimStarter');
        const ids = new Set([1n]);
        for (let id = 0; id < 13; id++) {
            const receipt = await win(id);
            const reward = parseEventLogs({ abi, logs: receipt.logs, eventName: 'TrophyMinted' })[0];
            assert.equal(reward.args.opponentId, id);
            const tokenId = await read('trophyOf', [account, id]);
            assert.ok(!ids.has(tokenId)); ids.add(tokenId);
            assert.equal(await read('ownerOf', [tokenId]), account);
            await assert.rejects(id === 2 ? send('claimDiyaeddineReward', ['YOU LOSE IMMEDIATLY']) : send('battle', [id, 1]), /AlreadyDefeated/);
        }
        const before = await read('getPlayer', [account]);
        assert.equal(before[1], 8191);
        await send('transferFrom', [account, other, await read('trophyOf', [account, 0])]);
        assert.deepEqual(await read('getPlayer', [account]), before);
        assert.deepEqual(await read('getPlayer', [other]), [0n, 0, false]);
        const champion = await win(13);
        assert.equal(parseEventLogs({ abi, logs: champion.logs, eventName: 'ChampionMinted' }).length, 1);
        assert.equal((await read('getPlayer', [account]))[2], true);
        assert.equal(await read('nextTokenId'), 16n);
        await assert.rejects(send('battle', [13, 0]), /AlreadyDefeated/);
        const metadata = JSON.parse(Buffer.from((await read('tokenURI', [15n])).split(',')[1], 'base64').toString());
        assert.match(metadata.name, /PANORAMIX Champion/);
    });
});
