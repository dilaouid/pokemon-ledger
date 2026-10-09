import { expect, it } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { validateTransaction } from './validateTransaction';
import type { GameTransaction } from './WalletService';

const tx: GameTransaction = { chainId: 11155111, to: '0x0000000000000000000000000000000000000001', data: '0x1234', value: 0n, nonce: 1, gas: 100000n, maxFeePerGas: 2000000000n, maxPriorityFeePerGas: 1000000000n };
it('accepts a matching Sepolia signature and contract creation', async () => {
    const signer = privateKeyToAccount(generatePrivateKey());
    for (const expected of [tx, { ...tx, to: undefined }]) {
        const raw = await signer.signTransaction({ ...expected, type: 'eip1559' });
        await expect(validateTransaction(raw, expected, signer.address)).resolves.toBeUndefined();
    }
});
it('rejects mainnet signatures and other signers before broadcast', async () => {
    const signer = privateKeyToAccount(generatePrivateKey());
    const raw = await signer.signTransaction({ ...tx, chainId: 1, type: 'eip1559' });
    await expect(validateTransaction(raw, tx, signer.address)).rejects.toMatchObject({ code: 'WRONG_NETWORK' });
    const good = await signer.signTransaction({ ...tx, type: 'eip1559' });
    await expect(validateTransaction(good, tx, privateKeyToAccount(generatePrivateKey()).address)).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
});
it.each([{ value: 1n }, { data: '0x5678' as const }, { nonce: 2 }, { gas: 200000n }, { maxFeePerGas: 4000000000n }, { to: '0x0000000000000000000000000000000000000002' as const }])('rejects altered transaction content %o', async change => {
    const signer = privateKeyToAccount(generatePrivateKey());
    const raw = await signer.signTransaction({ ...tx, ...change, type: 'eip1559' });
    await expect(validateTransaction(raw, tx, signer.address)).rejects.toMatchObject({ code: 'INVALID_TRANSACTION' });
});
