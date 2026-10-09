import './bufferPolyfill';

// Keep all runtime SDK imports behind the early browser polyfill.
export { RpcError, ServerError, WalletAPIClient, WindowMessageTransport } from '@ledgerhq/wallet-api-client';
export type { Account, Transport } from '@ledgerhq/wallet-api-client';
