import { expect, it, vi } from 'vitest';
import { resolveTrap, TRAPS } from './traps';
import { MockWalletService } from '../services/wallet/MockWalletService';
import { WalletError } from '../services/wallet/WalletService';

it('sends the exact scoped trap message and approval only loses the encounter', async () => {
    const wallet = new MockWalletService();
    const sign = vi.spyOn(wallet, 'signMessage').mockResolvedValue('0x');
    expect(await resolveTrap(wallet, TRAPS[0])).toBe('LOSE');
    expect(sign).toHaveBeenCalledWith(TRAPS[0].signedMessage, undefined);
});
it('rewards only explicit refusal with the victory', async () => {
    const wallet = new MockWalletService();
    vi.spyOn(wallet, 'signMessage').mockRejectedValue(new WalletError('REJECTED', 'declined'));
    expect(await resolveTrap(wallet, TRAPS[0])).toBe('WIN');
});
it.each(['LOCKED', 'DISCONNECTED', 'TIMEOUT', 'UNKNOWN'] as const)('does not confuse %s with refusal', async code => {
    const wallet = new MockWalletService();
    vi.spyOn(wallet, 'signMessage').mockRejectedValue(new WalletError(code, 'failed'));
    await expect(resolveTrap(wallet, TRAPS[0])).rejects.toMatchObject({ code });
});
