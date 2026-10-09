import type { Address, Hex } from 'viem';

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_CURRENCY = 'ethereum_sepolia';

export interface WalletAccount {
    readonly id: string;
    readonly name: string;
    readonly address: Address;
    readonly chainId: typeof SEPOLIA_CHAIN_ID;
}

export interface WalletService {
    readonly mode: 'mock' | 'ledger';
    readonly selectedAccount: WalletAccount | null;
    listAccounts(): Promise<readonly WalletAccount[]>;
    selectAccount(): Promise<WalletAccount>;
    signMessage(message: string, mockApproved?: boolean): Promise<Hex>;
    signTransaction(transaction: GameTransaction): Promise<Hex>;
    dispose(): void;
}

export interface GameTransaction {
    chainId: typeof SEPOLIA_CHAIN_ID;
    to?: Address;
    data: Hex;
    value: 0n;
    nonce: number;
    gas: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
}

export type WalletErrorCode = 'REJECTED' | 'DISCONNECTED' | 'LOCKED' | 'UNAVAILABLE'
    | 'WRONG_NETWORK' | 'ACCOUNT_CHANGED' | 'INVALID_SIGNATURE' | 'INVALID_TRANSACTION' | 'TIMEOUT' | 'PERMISSION' | 'UNKNOWN';

export class WalletError extends Error {
    constructor(public readonly code: WalletErrorCode, message: string) {
        super(message);
        this.name = 'WalletError';
    }
}

export function managerMessage(): string {
    return 'LEDGERMON\nJOIN';
}
