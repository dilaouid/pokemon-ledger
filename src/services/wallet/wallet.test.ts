import { Buffer } from 'buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { RpcError, ServerError, WalletAPIClient, type Transport, type Account } from './ledgerSdk';
import { LedgerWalletService, type LedgerClient } from './LedgerWalletService';
import { MockWalletService } from './MockWalletService';
import { walletError } from './errors';
import { validateTransaction } from './validateTransaction';
import { managerMessage, SEPOLIA_CHAIN_ID, type GameTransaction } from './WalletService';
import { createWalletService } from './createWalletService';

function fixture() {
    // Ephemeral test signer only; never used in the game or deployment.
    const signer = privateKeyToAccount(generatePrivateKey());
    const account = {
        id: 'sepolia-test', name: 'Test player', address: signer.address, currency: 'ethereum_sepolia',
    } as Account;
    const request = vi.fn(async () => account);
    const list = vi.fn(async () => [account]);
    const sign = vi.fn(async (_id: string, message: Buffer) =>
        Buffer.from((await signer.signMessage({ message: message.toString('utf8') })).slice(2), 'hex'));
    const client: LedgerClient = { account: { request, list }, message: { sign } };
    const disconnect = vi.fn();
    const service = new LedgerWalletService(() => ({ client, disconnect }), 1000);
    return { service, account, request, list, sign, disconnect };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Ledger wallet session', () => {
    it('uses the Sepolia picker once and verifies subsequent signatures for that account', async () => {
        const f = fixture();
        const account = await f.service.selectAccount();
        expect(account).toMatchObject({ id: f.account.id, name: f.account.name, address: f.account.address, chainId: SEPOLIA_CHAIN_ID });
        expect(await f.service.selectAccount()).toBe(account);
        expect(f.request).toHaveBeenCalledExactlyOnceWith({ currencyIds: ['ethereum_sepolia'] });
        const message = managerMessage();
        expect(message).toBe('LEDGERMON\nJOIN');
        await expect(f.service.signMessage(message)).resolves.toMatch(/^0x[0-9a-f]{130}$/);
        await f.service.signMessage('Another scoped game message');
        expect(f.request).toHaveBeenCalledTimes(1);
        expect(f.sign.mock.calls[0][0]).toBe(account.id);
        expect(f.sign.mock.calls[0][1].toString('utf8')).toBe(message);
        f.service.dispose();
        expect(f.disconnect).toHaveBeenCalledOnce();
    });

    it('lists only supported accessible accounts', async () => {
        const f = fixture();
        f.list.mockResolvedValue([f.account, { ...f.account, currency: 'ethereum' }]);
        expect(await f.service.listAccounts()).toHaveLength(1);
        expect(f.list).toHaveBeenCalledWith({ currencyIds: ['ethereum_sepolia'] });
    });

    it.each(['ethereum', 'bitcoin'])('rejects wrong currency %s', async currency => {
        const f = fixture();
        f.request.mockResolvedValue({ ...f.account, currency });
        await expect(f.service.selectAccount()).rejects.toMatchObject({ code: 'WRONG_NETWORK' });
        expect(f.service.selectedAccount).toBeNull();
        expect(f.sign).not.toHaveBeenCalled();
    });

    it('refuses signing before selection and when an account disappears', async () => {
        const f = fixture();
        await expect(f.service.signMessage('test')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
        await f.service.selectAccount();
        f.list.mockResolvedValue([]);
        await expect(f.service.signMessage('test')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
        expect(f.sign).not.toHaveBeenCalled();
    });

    it('detects an address change before signing', async () => {
        const f = fixture();
        await f.service.selectAccount();
        f.list.mockResolvedValue([{ ...f.account, address: privateKeyToAccount(generatePrivateKey()).address }]);
        await expect(f.service.signMessage('test')).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
        expect(f.sign).not.toHaveBeenCalled();
    });

    it('rejects another account signature and malformed signatures', async () => {
        const f = fixture();
        await f.service.selectAccount();
        const wrongSigner = privateKeyToAccount(generatePrivateKey());
        f.sign.mockResolvedValue(Buffer.from((await wrongSigner.signMessage({ message: 'test' })).slice(2), 'hex'));
        await expect(f.service.signMessage('test')).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
        f.sign.mockResolvedValue(Buffer.from('00', 'hex'));
        await expect(f.service.signMessage('test')).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
    });

    it('checks account availability again after device signing', async () => {
        const f = fixture();
        await f.service.selectAccount();
        f.list.mockResolvedValueOnce([f.account]).mockResolvedValueOnce([]);
        await expect(f.service.signMessage('test')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    });

    it('permits retry after explicit rejection without selecting again', async () => {
        const f = fixture();
        await f.service.selectAccount();
        f.sign.mockRejectedValueOnce({ name: 'UserRefusedOnDevice' });
        await expect(f.service.signMessage('test')).rejects.toMatchObject({ code: 'REJECTED' });
        await expect(f.service.signMessage('test')).resolves.toMatch(/^0x/);
        expect(f.request).toHaveBeenCalledOnce();
    });

    it('does not authenticate a late response after timeout or allow duplicate requests', async () => {
        vi.useFakeTimers();
        const f = fixture();
        let resolve!: (value: Account) => void;
        f.request.mockReturnValue(new Promise(done => { resolve = done; }));
        const pending = f.service.selectAccount();
        const assertion = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
        await expect(f.service.selectAccount()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
        await vi.advanceTimersByTimeAsync(1001);
        await assertion;
        resolve(f.account);
        await Promise.resolve();
        expect(f.service.selectedAccount).toBeNull();
        expect(f.disconnect).toHaveBeenCalledOnce();
        await expect(f.service.selectAccount()).rejects.toMatchObject({ code: 'DISCONNECTED' });
    });

    it('signs calls and contract creation', async () => {
        const signer = privateKeyToAccount(generatePrivateKey());
        const account = { id: 'sepolia-test', name: 'Test player', address: signer.address, currency: 'ethereum_sepolia' } as Account;
        const tx: GameTransaction = {
            chainId: SEPOLIA_CHAIN_ID, to: '0x0000000000000000000000000000000000000001', data: '0x6001600c', value: 0n, nonce: 3,
            gas: 200000n, maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n,
        };
        const sign = vi.fn(async (id: string, raw: { recipient: string }) => {
            expect(id).toBe(account.id);
            expect(typeof raw.recipient).toBe('string');
            return Buffer.from((await signer.signTransaction({ ...tx, type: 'eip1559' })).slice(2), 'hex');
        });
        const client: LedgerClient = {
            account: { request: vi.fn(async () => account), list: vi.fn(async () => [account]) },
            message: { sign: vi.fn() },
            transaction: { sign },
        };
        const service = new LedgerWalletService(() => ({ client, disconnect: vi.fn() }), 1000);
        await service.selectAccount();
        const creation = { ...tx, to: undefined };
        sign.mockImplementationOnce(async () => Buffer.from((await signer.signTransaction({ ...creation, type: 'eip1559' })).slice(2), 'hex'));
        const created = await service.signTransaction(creation);
        expect(sign.mock.calls[0][1]).toMatchObject({ recipient: '' });
        await expect(validateTransaction(created, creation, signer.address)).resolves.toBeUndefined();
        const raw = await service.signTransaction(tx);
        expect(sign.mock.calls[1][1]).toMatchObject({ recipient: tx.to });
        await expect(validateTransaction(raw, tx, signer.address)).resolves.toBeUndefined();
        const ascii = Buffer.from(raw, 'utf8');
        sign.mockResolvedValueOnce(ascii);
        await expect(validateTransaction(await service.signTransaction(tx), tx, signer.address)).resolves.toBeUndefined();
        service.dispose();
    });

    it('cancels pending selection on shutdown', async () => {
        const f = fixture();
        f.request.mockReturnValue(new Promise(() => {}));
        const pending = f.service.selectAccount();
        f.service.dispose();
        await expect(pending).rejects.toMatchObject({ code: 'DISCONNECTED' });
        expect(f.service.selectedAccount).toBeNull();
    });
});

describe('error classification', () => {
    it('handles the installed SDK ServerError class', () => {
        expect(walletError(new ServerError({ code: 'ACCOUNT_NOT_FOUND', message: 'missing', data: { accountId: 'gone' } })).code).toBe('UNAVAILABLE');
        expect(walletError(new ServerError({ code: 'PERMISSION_DENIED', message: 'denied', data: { methodId: 'message.sign' } })).code).toBe('PERMISSION');
    });
    it.each([
        ['UserRefusedOnDevice', 'REJECTED'], ['RecipientRequired', 'INVALID_TRANSACTION'], ['LockedDeviceError', 'LOCKED'],
        ['DisconnectedDeviceDuringOperation', 'DISCONNECTED'], ['UnexpectedFailure', 'UNKNOWN'],
    ])('maps nested SDK error %s to %s', (name, expected) => {
        const error = new RpcError({ code: -32000, message: 'server error', data: { code: 'UNKNOWN_ERROR', data: { name } } });
        expect(walletError(error).code).toBe(expected);
    });
    it('does not mistake permissions or vague cancellation text for intentional rejection', () => {
        expect(walletError(new RpcError({ code: -32000, message: 'denied', data: { code: 'PERMISSION_DENIED' } })).code).toBe('PERMISSION');
        expect(walletError(new Error('User rejected or disconnected')).code).toBe('UNKNOWN');
    });
});

it('round-trips account selection and UTF-8 signing through the installed SDK JSON-RPC encoding', async () => {
    const signer = privateKeyToAccount(generatePrivateKey());
    const rawAccount = { id: 'sdk-account', name: 'SDK player', address: signer.address,
        currency: 'ethereum_sepolia', balance: '0', spendableBalance: '0', blockHeight: 1, lastSyncDate: new Date().toISOString() };
    const requests: string[] = [];
    const transport: Transport = {
        onMessage: undefined,
        send: (payload: string) => {
            const request = JSON.parse(payload) as { id: string; method: string; params: { accountId?: string; hexMessage?: string } };
            requests.push(request.method);
            void (async () => {
                let result: unknown;
                if (request.method === 'account.request') result = { rawAccount };
                else if (request.method === 'account.list') result = { rawAccounts: [rawAccount] };
                else {
                    expect(request.params.accountId).toBe(rawAccount.id);
                    const message = Buffer.from(request.params.hexMessage!, 'hex').toString('utf8');
                    expect(message).toBe('POKEMON LEDGER\nACTION: JOIN GAME');
                    result = { hexSignedMessage: (await signer.signMessage({ message })).slice(2) };
                }
                transport.onMessage?.(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
            })();
        },
    };
    const client = new WalletAPIClient(transport);
    const service = new LedgerWalletService(() => ({ client, disconnect: () => {} }));
    await service.selectAccount();
    await expect(service.signMessage('POKEMON LEDGER\nACTION: JOIN GAME')).resolves.toMatch(/^0x[0-9a-f]{130}$/);
    expect(requests).toEqual(['account.request', 'account.list', 'message.sign', 'account.list']);
    service.dispose();
});

describe('mock mode', () => {
    it('is the default and never silently replaces an invalid mode', () => {
        vi.stubEnv('VITE_WALLET_MODE', 'mock');
        expect(createWalletService()).toBeInstanceOf(MockWalletService);
        vi.stubEnv('VITE_WALLET_MODE', 'ledger');
        expect(createWalletService()).toBeInstanceOf(LedgerWalletService);
        vi.stubEnv('VITE_WALLET_MODE', 'typo');
        expect(createWalletService).toThrow();
    });
    it('preserves simulated approval and refusal', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('window', globalThis);
        const wallet = new MockWalletService();
        await wallet.selectAccount();
        const approved = wallet.signMessage('test', true);
        await vi.advanceTimersByTimeAsync(1100);
        await expect(approved).resolves.toBe('0x');
        const rejected = expect(wallet.signMessage('test', false)).rejects.toMatchObject({ code: 'REJECTED' });
        await vi.advanceTimersByTimeAsync(1100);
        await rejected;
    });
});
