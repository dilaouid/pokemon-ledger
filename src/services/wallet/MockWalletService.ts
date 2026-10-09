import { mockDeviceSignature } from '../../game/blockchain/mockChain';
import { SEPOLIA_CHAIN_ID, WalletError, type WalletAccount, type WalletService } from './WalletService';

export class MockWalletService implements WalletService {
    readonly mode = 'mock';
    selectedAccount: WalletAccount | null = null;
    private readonly account: WalletAccount = Object.freeze({
        id: 'mock-sepolia', name: 'Mock player',
        address: '0x0000000000000000000000000000000000000001', chainId: SEPOLIA_CHAIN_ID,
    });

    async listAccounts(): Promise<readonly WalletAccount[]> { return [this.account]; }
    async selectAccount(): Promise<WalletAccount> {
        this.selectedAccount = this.account;
        return this.account;
    }
    async signMessage(_message: string, mockApproved = true): Promise<`0x${string}`> {
        if (!this.selectedAccount) throw new WalletError('UNAVAILABLE', 'Select an account first.');
        if (await mockDeviceSignature(mockApproved) === 'rejected') {
            throw new WalletError('REJECTED', 'Mock device refused.');
        }
        // Explicitly a mock sentinel; never used as proof of a real signature.
        return '0x';
    }
    dispose(): void { this.selectedAccount = null; }
    async signTransaction(): Promise<`0x${string}`> {
        throw new WalletError('UNAVAILABLE', 'Mock transactions use the simulated chain.');
    }
}
