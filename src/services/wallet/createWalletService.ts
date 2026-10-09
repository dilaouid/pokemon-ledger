import { LedgerWalletService } from './LedgerWalletService';
import { MockWalletService } from './MockWalletService';
import type { WalletService } from './WalletService';

export function createWalletService(): WalletService {
    const mode = import.meta.env.VITE_WALLET_MODE ?? 'mock';
    if (mode === 'ledger') return new LedgerWalletService();
    if (mode === 'mock') return new MockWalletService();
    throw new Error('VITE_WALLET_MODE must be mock or ledger.');
}
