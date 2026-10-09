import { RpcError, ServerError } from './ledgerSdk';
import { WalletError } from './WalletService';

const object = (value: unknown): Record<string, unknown> =>
    typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};

export function walletError(error: unknown): WalletError {
    if (error instanceof WalletError) return error;
    const outer = error instanceof RpcError || error instanceof ServerError ? object(error.getData()) : object(error);
    const inner = object(outer.data);
    const name = inner.name ?? outer.name;
    const code = outer.code ?? (error instanceof RpcError ? error.getCode() : undefined);
    // Do not infer intentional rejection from arbitrary error text or permission failures.
    if (code === 4001 || name === 'UserRefusedOnDevice' || name === 'UserRefusedAddress'
        || name === 'UserRefusedOnDeviceError' || name === 'UserDenied') {
        return new WalletError('REJECTED', 'Signature declined.');
    }
    if (name === 'LockedDeviceError' || name === 'DeviceLocked') return new WalletError('LOCKED', 'Unlock your Ledger.');
    if (name === 'DisconnectedDevice' || name === 'DisconnectedDeviceDuringOperation'
        || name === 'TransportOpenUserCancelled') return new WalletError('DISCONNECTED', 'Reconnect your Ledger.');
    if (code === 'ACCOUNT_NOT_FOUND') return new WalletError('UNAVAILABLE', 'Account unavailable.');
    if (name === 'RecipientRequired') return new WalletError('INVALID_TRANSACTION', 'The wallet rejected a transaction with no recipient.');
    if (code === 'PERMISSION_DENIED') return new WalletError('PERMISSION', 'Check app permissions.');
    if (code === 'NOT_IMPLEMENTED_BY_WALLET' || code === 'CURRENCY_NOT_FOUND') {
        return new WalletError('UNAVAILABLE', 'Wallet lacks support.');
    }
    return new WalletError('UNKNOWN', 'Wallet request failed.');
}
