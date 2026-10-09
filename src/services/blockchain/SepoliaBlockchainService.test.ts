import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, getContractAddress, keccak256, stringToHex, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { ledgerMonAbi } from '../../contracts/abi';
import { deriveStarter } from '../../domain/deriveStarter';
import { SEPOLIA_CHAIN_ID, type WalletService } from '../wallet/WalletService';
import { SepoliaBlockchainService } from './SepoliaBlockchainService';

const rpc = vi.hoisted(() => ({
    getChainId: vi.fn(), getCode: vi.fn(), readContract: vi.fn(), estimateGas: vi.fn(), estimateFeesPerGas: vi.fn(),
    getTransactionCount: vi.fn(), getBalance: vi.fn(), sendRawTransaction: vi.fn(), waitForTransactionReceipt: vi.fn(),
}));
vi.mock('viem', async original => ({ ...await original<typeof import('viem')>(), createPublicClient: () => rpc }));
const contract: Address = '0x00000000000000000000000000000000000000AA';
let wallet: WalletService;
let starterClaimed: boolean;
let values: Map<string, string>;
let latestHash: Hex;
beforeEach(() => {
    vi.resetAllMocks();
    values = new Map();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
    vi.stubEnv('VITE_LEDGERMON_ADDRESS', contract);
    const signer = privateKeyToAccount(generatePrivateKey());
    wallet = {
        mode: 'ledger', selectedAccount: { id: 'test', name: 'Test', address: signer.address, chainId: SEPOLIA_CHAIN_ID },
        listAccounts: vi.fn(), selectAccount: vi.fn(), signMessage: vi.fn(), dispose: vi.fn(),
        signTransaction: vi.fn(async tx => signer.signTransaction({ ...tx, type: 'eip1559' })),
    };
    starterClaimed = false;
    rpc.getChainId.mockResolvedValue(SEPOLIA_CHAIN_ID);
    rpc.getCode.mockResolvedValue('0x');
    rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
        if (functionName === 'GAME_VERSION') return keccak256(stringToHex('LEDGERMON_V3_FRIENDLY_BATTLES'));
        if (functionName === 'getPlayer') return [starterClaimed ? 1n : 0n, 0, false];
        if (functionName === 'deriveStarter') { const s = deriveStarter(signer.address); return [s.speciesId, s.attack, s.defense]; }
        return 0n;
    });
    rpc.estimateGas.mockResolvedValue(100000n);
    rpc.estimateFeesPerGas.mockResolvedValue({ maxFeePerGas: 2000000000n, maxPriorityFeePerGas: 1000000000n });
    rpc.getTransactionCount.mockResolvedValue(0);
    rpc.getBalance.mockResolvedValue(1000000000000000000n);
    rpc.sendRawTransaction.mockImplementation(async ({ serializedTransaction }: { serializedTransaction: Hex }) => {
        latestHash = keccak256(serializedTransaction);
        // Recovery information must exist BEFORE the broadcast.
        expect([...values.values()].some(value => value.includes(latestHash))).toBe(true);
        return latestHash;
    });
    rpc.waitForTransactionReceipt.mockImplementation(async () => ({ status: 'success', transactionHash: latestHash, logs: [] }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('checks RPC chain before any signature or broadcast', async () => {
    rpc.getChainId.mockResolvedValue(1);
    await expect(new SepoliaBlockchainService(wallet).claimStarter()).rejects.toMatchObject({ code: 'WRONG_NETWORK' });
    expect(wallet.signTransaction).not.toHaveBeenCalled();
});
it('rejects insufficient funds without prompting the device', async () => {
    rpc.getBalance.mockResolvedValue(0n);
    await expect(new SepoliaBlockchainService(wallet).claimStarter()).rejects.toMatchObject({ code: 'FUNDS' });
    expect(wallet.signTransaction).not.toHaveBeenCalled();
});
it('waits for a successful receipt and clears only the pending cache', async () => {
    const status = vi.fn();
    await new SepoliaBlockchainService(wallet, status).claimStarter();
    expect(rpc.waitForTransactionReceipt).toHaveBeenCalledOnce();
    expect(status).toHaveBeenLastCalledWith({ phase: 'confirmed', message: 'CONFIRMED ON SEPOLIA', hash: latestHash });
    expect(values.size).toBe(0);
});
it('retains pending transactions across reload and resumes the same signed bytes without signing twice', async () => {
    rpc.waitForTransactionReceipt.mockRejectedValueOnce(new Error('timeout'));
    await expect(new SepoliaBlockchainService(wallet).claimStarter()).rejects.toMatchObject({ code: 'PENDING' });
    expect(values.size).toBe(1);
    await new SepoliaBlockchainService(wallet).recoverPending();
    expect(wallet.signTransaction).toHaveBeenCalledOnce();
    expect(rpc.sendRawTransaction.mock.calls[1]).toEqual(rpc.sendRawTransaction.mock.calls[0]);
    expect(values.size).toBe(0);
});
it('does not accept a reverted or replaced transaction as confirmation', async () => {
    rpc.waitForTransactionReceipt.mockImplementationOnce(async () => ({ status: 'reverted', transactionHash: latestHash, logs: [] }));
    await expect(new SepoliaBlockchainService(wallet).claimStarter()).rejects.toMatchObject({ code: 'REVERTED' });
    rpc.waitForTransactionReceipt.mockResolvedValueOnce({ status: 'success', transactionHash: `0x${'ab'.repeat(32)}`, logs: [] });
    await expect(new SepoliaBlockchainService(wallet).claimStarter()).rejects.toMatchObject({ code: 'REPLACED' });
});
it('reads the matching contract battle event and rejects events from a different emitter', async () => {
    starterClaimed = true;
    const log = {
        address: contract,
        topics: encodeEventTopics({ abi: ledgerMonAbi, eventName: 'BattleResolved', args: { player: wallet.selectedAccount!.address, opponentId: 1 } }),
        data: encodeAbiParameters([{ type: 'uint8' }, { type: 'bool' }, { type: 'uint8' }, { type: 'uint8' }], [1, false, 50, 80]),
    };
    rpc.waitForTransactionReceipt.mockImplementationOnce(async () => ({ status: 'success', transactionHash: latestHash, logs: [log] }));
    const service = new SepoliaBlockchainService(wallet);
    expect(await service.battle(1, 1)).toMatchObject({ won: false, opponentId: 1 });
    rpc.waitForTransactionReceipt.mockImplementationOnce(async () => ({ status: 'success', transactionHash: latestHash, logs: [{ ...log, address: '0x00000000000000000000000000000000000000BB' }] }));
    await expect(service.battle(1, 1)).rejects.toMatchObject({ code: 'EVENT' });
});
it('deploys by direct contract creation from the deployer', async () => {
    vi.stubEnv('VITE_LEDGERMON_ADDRESS', '');
    vi.stubEnv('VITE_DEPLOYER_ADDRESS', wallet.selectedAccount!.address);
    const service = new SepoliaBlockchainService(wallet);
    const address = await service.deploy();
    const signed = vi.mocked(wallet.signTransaction).mock.calls[0][0];
    const { ledgerMonBytecode } = await import('../../contracts/bytecode');
    expect(signed.to).toBeUndefined();
    expect(signed.data).toBe(ledgerMonBytecode);
    expect(address).toBe(getContractAddress({ from: wallet.selectedAccount!.address, nonce: 0n }));
    expect(service.contract).toBe(address);
});
it('adopts an existing deployer contract without signing', async () => {
    vi.stubEnv('VITE_LEDGERMON_ADDRESS', '');
    vi.stubEnv('VITE_DEPLOYER_ADDRESS', wallet.selectedAccount!.address);
    rpc.getTransactionCount.mockResolvedValue(1);
    rpc.getCode.mockResolvedValue('0x6000');
    const service = new SepoliaBlockchainService(wallet);
    expect(await service.deploy()).toBe(getContractAddress({ from: wallet.selectedAccount!.address, nonce: 0n }));
    expect(wallet.signTransaction).not.toHaveBeenCalled();
});
it('does not create a contract from another account', async () => {
    vi.stubEnv('VITE_LEDGERMON_ADDRESS', '');
    vi.stubEnv('VITE_DEPLOYER_ADDRESS', '0x823Ab8a0dB1c87Ee62042495db9bae1c8e2D30dB');
    await expect(new SepoliaBlockchainService(wallet).deploy()).rejects.toMatchObject({ code: 'DEPLOYMENT' });
    expect(wallet.signTransaction).not.toHaveBeenCalled();
});
it('does not broadcast a modified pending cache', async () => {
    rpc.waitForTransactionReceipt.mockRejectedValueOnce(new Error('timeout'));
    await expect(new SepoliaBlockchainService(wallet).claimStarter()).rejects.toMatchObject({ code: 'PENDING' });
    const [key, raw] = [...values.entries()][0];
    const pending = JSON.parse(raw); pending.hash = `0x${'00'.repeat(32)}`;
    values.set(key, JSON.stringify(pending));
    rpc.sendRawTransaction.mockClear();
    await expect(new SepoliaBlockchainService(wallet).recoverPending()).rejects.toMatchObject({ code: 'CACHE' });
    expect(rpc.sendRawTransaction).not.toHaveBeenCalled();
});

it('only confirms the security reward from its matching trophy receipt', async () => {
    starterClaimed = true;
    const log = {
        address: contract,
        topics: encodeEventTopics({ abi: ledgerMonAbi, eventName: 'TrophyMinted', args: { player: wallet.selectedAccount!.address, opponentId: 2, tokenId: 2n } }),
        data: '0x',
    };
    const service = new SepoliaBlockchainService(wallet);
    await expect(service.battle(2, 0)).rejects.toMatchObject({ code: 'SECURITY_CHALLENGE' });
    expect(wallet.signTransaction).not.toHaveBeenCalled();
    rpc.waitForTransactionReceipt.mockImplementationOnce(async () => ({ status: 'success', transactionHash: latestHash, logs: [log] }));
    expect(await service.claimSecurityVictory('YOU LOSE IMMEDIATLY')).toMatchObject({ won: true, opponentId: 2 });
    rpc.waitForTransactionReceipt.mockImplementationOnce(async () => ({ status: 'success', transactionHash: latestHash, logs: [] }));
    await expect(service.claimSecurityVictory('YOU LOSE IMMEDIATLY')).rejects.toMatchObject({ code: 'EVENT' });
});
