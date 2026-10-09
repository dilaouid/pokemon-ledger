import { afterEach, expect, it, vi } from 'vitest';
import { MockWalletService } from '../wallet/MockWalletService';
import { MockBlockchainService } from './MockBlockchainService';
import { GameController } from '../../game/controllers/GameController';
import { TRAPS } from '../../domain/traps';
import { WalletError } from '../wallet/WalletService';

afterEach(() => vi.useRealTimers());
it('isolates accounts and follows the full 13-trainer progression with unique rewards', async () => {
    vi.useFakeTimers();
    const wallet = new MockWalletService();
    const account = await wallet.selectAccount();
    const chain = new MockBlockchainService(wallet, () => {}, () => 0);
    const advance = async <T>(request: Promise<T>): Promise<T> => { await vi.runAllTimersAsync(); return request; };
    await advance(chain.claimStarter());
    await expect(chain.claimStarter()).rejects.toMatchObject({ code: 'ALREADY_CLAIMED' });
    await expect(chain.battle(13, 0)).rejects.toMatchObject({ code: 'BOSS_LOCKED' });
    for (let i = 0; i < 13; i++) {
        expect((await advance(i === 2 ? chain.claimSecurityVictory('YOU LOSE IMMEDIATLY') : chain.battle(i, 0))).won).toBe(true);
        await expect(i === 2 ? chain.claimSecurityVictory('YOU LOSE IMMEDIATLY') : chain.battle(i, 1)).rejects.toMatchObject({ code: 'ALREADY_DEFEATED' });
    }
    await advance(chain.battle(13, 1));
    expect(await chain.readPlayer(account.address)).toMatchObject({ defeatedMask: 8191, bossDefeated: true });
    expect(new Set((await chain.rewards(account.address)).map(token => token.tokenId)).size).toBe(15);
    expect(await chain.readPlayer('0x0000000000000000000000000000000000000002')).toMatchObject({ starterTokenId: 0n, defeatedMask: 0 });
});
it('does not change progress or mint on losses or either trap outcome', async () => {
    vi.useFakeTimers();
    const wallet = new MockWalletService();
    const account = await wallet.selectAccount();
    const chain = new MockBlockchainService(wallet, () => {}, () => 0.99);
    const controller = new GameController(wallet, chain);
    await controller.initialize();
    const claim = controller.claimStarter(); await vi.runAllTimersAsync(); await claim;
    const before = await chain.readPlayer(account.address);
    const battle = controller.battle(0, 0); await vi.runAllTimersAsync();
    expect((await battle).won).toBe(false);
    vi.spyOn(wallet, 'signMessage').mockResolvedValue('0x');
    expect(await controller.trap(TRAPS[0])).toBe('LOSE');
    vi.mocked(wallet.signMessage).mockRejectedValue(new WalletError('REJECTED', 'declined'));
    expect(await controller.trap(TRAPS[0])).toBe('WIN');
    expect(await chain.readPlayer(account.address)).toEqual(before);
    expect(await chain.rewards(account.address)).toHaveLength(1);
});
