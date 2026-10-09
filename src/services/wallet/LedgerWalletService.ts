import { Buffer } from 'buffer';
import BigNumber from 'bignumber.js';
import { WalletAPIClient, WindowMessageTransport, type Account } from './ledgerSdk';
import { getAddress, verifyMessage, type Hex } from 'viem';
import { walletError } from './errors';
import { SEPOLIA_CHAIN_ID, SEPOLIA_CURRENCY, WalletError, type GameTransaction, type WalletAccount, type WalletService } from './WalletService';
import { validateTransaction } from './validateTransaction';

function signedTransaction(signed: Buffer): Hex {
    // Ledger Wallet sometimes returns the 0x-prefixed text, hex-encoded a second time.
    const text = signed.toString('utf8');
    if (/^0x[0-9a-fA-F]+$/.test(text)) return text as Hex;
    return `0x${signed.toString('hex')}`;
}

export interface LedgerClient {
    account: Pick<WalletAPIClient['account'], 'list' | 'request'>;
    message: Pick<WalletAPIClient['message'], 'sign'>;
    transaction?: Pick<WalletAPIClient['transaction'], 'sign'>;
}
export interface LedgerConnection { client: LedgerClient; disconnect(): void }

function connect(): LedgerConnection {
    const transport = new WindowMessageTransport();
    const client = new WalletAPIClient(transport);
    transport.connect();
    return { client, disconnect: () => transport.disconnect() };
}

function toAccount(account: Account): WalletAccount {
    if (account.currency !== SEPOLIA_CURRENCY) throw new WalletError('WRONG_NETWORK', 'Use Ethereum Sepolia.');
    try {
        if (!account.id) throw new Error('Missing account ID');
        return Object.freeze({ id: account.id, name: account.name, address: getAddress(account.address), chainId: SEPOLIA_CHAIN_ID });
    } catch {
        throw new WalletError('UNAVAILABLE', 'Invalid wallet account.');
    }
}

export class LedgerWalletService implements WalletService {
    readonly mode = 'ledger';
    private account: WalletAccount | null = null;
    private connection?: LedgerConnection;
    private pending = false;
    private closed = false;
    private cancel?: () => void;

    constructor(private readonly factory: () => LedgerConnection = connect, private readonly timeoutMs = 120_000) {}
    get selectedAccount(): WalletAccount | null { return this.account; }

    private async request<T>(operation: (client: LedgerClient) => Promise<T>): Promise<T> {
        if (this.closed) throw new WalletError('DISCONNECTED', 'Restart the game.');
        if (this.pending) throw new WalletError('UNAVAILABLE', 'Wallet request pending.');
        this.pending = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            this.connection ??= this.factory();
            const client = this.connection.client;
            const result = await Promise.race([
                operation(client),
                new Promise<never>((_, reject) => {
                    this.cancel = () => reject(new WalletError('DISCONNECTED', 'Wallet session closed.'));
                    timer = setTimeout(() => {
                        // The SDK cannot cancel a host prompt. Close this session so late
                        // responses cannot authenticate, and require reload before retry.
                        this.closed = true;
                        this.connection?.disconnect();
                        reject(new WalletError('TIMEOUT', 'Wallet timed out. Reload.'));
                    }, this.timeoutMs);
                }),
            ]);
            if (this.closed) throw new WalletError('DISCONNECTED', 'Restart the game.');
            return result;
        } catch (error) {
            throw walletError(error);
        } finally {
            clearTimeout(timer);
            this.pending = false;
            this.cancel = undefined;
        }
    }

    async listAccounts(): Promise<readonly WalletAccount[]> {
        return this.request(async client => (await client.account.list({ currencyIds: [SEPOLIA_CURRENCY] }))
            .filter(account => account.currency === SEPOLIA_CURRENCY).map(toAccount));
    }

    async selectAccount(): Promise<WalletAccount> {
        if (this.closed) throw new WalletError('DISCONNECTED', 'Restart the game.');
        if (this.account) return this.account;
        const account = await this.request(async client => toAccount(await client.account.request({ currencyIds: [SEPOLIA_CURRENCY] })));
        if (this.closed) throw new WalletError('DISCONNECTED', 'Restart the game.');
        this.account = account;
        return account;
    }

    async signMessage(message: string): Promise<Hex> {
        const account = this.account;
        if (!account) throw new WalletError('UNAVAILABLE', 'Select an account first.');
        return this.request(async client => {
            const checkAccount = async () => {
                const accounts = await client.account.list({ currencyIds: [SEPOLIA_CURRENCY] });
                const current = accounts.find(candidate => candidate.id === account.id);
                if (!current) throw new WalletError('UNAVAILABLE', 'Account unavailable.');
                if (toAccount(current).address !== account.address) throw new WalletError('ACCOUNT_CHANGED', 'Account changed. Reload.');
            };
            await checkAccount();
            if (this.closed) throw new WalletError('DISCONNECTED', 'Restart the game.');
            const bytes = await client.message.sign(account.id, Buffer.from(message, 'utf8'));
            const signature = signedTransaction(bytes);
            let valid = false;
            try { valid = await verifyMessage({ address: account.address, message, signature }); } catch { /* Invalid response. */ }
            if (!valid) throw new WalletError('INVALID_SIGNATURE', 'Signature mismatch.');
            if (this.closed) throw new WalletError('DISCONNECTED', 'Restart the game.');
            await checkAccount();
            return signature;
        });
    }

    async signTransaction(tx: GameTransaction): Promise<Hex> {
        const account = this.account;
        if (!account) throw new WalletError('UNAVAILABLE', 'Select an account first.');
        if (tx.chainId !== SEPOLIA_CHAIN_ID) throw new WalletError('WRONG_NETWORK', 'Use Ethereum Sepolia.');
        return this.request(async client => {
            const accounts = await client.account.list({ currencyIds: [SEPOLIA_CURRENCY] });
            const current = accounts.find(candidate => candidate.id === account.id);
            if (!current) throw new WalletError('UNAVAILABLE', 'Account unavailable.');
            if (toAccount(current).address !== account.address) throw new WalletError('ACCOUNT_CHANGED', 'Account changed. Reload.');
            if (!client.transaction || this.closed) throw new WalletError('UNAVAILABLE', 'Signing unavailable.');
            // The installed SDK selects the chain from the account currency.
            // We check the signed chain ID before permitting any broadcast.
            // An empty recipient is a contract creation. Calls always name LedgerMon.
            const signed = await client.transaction.sign(account.id, {
                family: 'ethereum', recipient: tx.to ?? '', amount: new BigNumber(0),
                data: Buffer.from(tx.data.slice(2), 'hex'), nonce: tx.nonce,
                gasLimit: new BigNumber(tx.gas.toString()),
                maxFeePerGas: new BigNumber(tx.maxFeePerGas.toString()),
                maxPriorityFeePerGas: new BigNumber(tx.maxPriorityFeePerGas.toString()),
            });
            const raw = signedTransaction(signed);
            await validateTransaction(raw, tx, account.address);
            return raw;
        });
    }

    dispose(): void {
        this.closed = true;
        this.account = null;
        this.cancel?.();
        this.connection?.disconnect();
        this.connection = undefined;
    }
}
