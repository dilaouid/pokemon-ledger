import { getAddress, parseTransaction, recoverTransactionAddress, type Address, type Hex, type TransactionSerialized } from 'viem';
import { SEPOLIA_CHAIN_ID, WalletError, type GameTransaction } from './WalletService';

export async function validateTransaction(raw: Hex, expected: GameTransaction, account: Address): Promise<void> {
    const tx = parseTransaction(raw);
    if (tx.chainId !== SEPOLIA_CHAIN_ID || expected.chainId !== SEPOLIA_CHAIN_ID) {
        throw new WalletError('WRONG_NETWORK', 'Use Ethereum Sepolia.');
    }
    if (getAddress(await recoverTransactionAddress({ serializedTransaction: raw as TransactionSerialized })) !== getAddress(account)) {
        throw new WalletError('ACCOUNT_CHANGED', 'Wrong transaction signer.');
    }
    if (tx.to?.toLowerCase() !== expected.to?.toLowerCase() || (tx.data ?? '0x') !== expected.data
        || (tx.value ?? 0n) !== 0n || tx.nonce !== expected.nonce || tx.gas !== expected.gas
        || tx.maxFeePerGas !== expected.maxFeePerGas || tx.maxPriorityFeePerGas !== expected.maxPriorityFeePerGas) {
        throw new WalletError('INVALID_TRANSACTION', 'Transaction changed.');
    }
}
