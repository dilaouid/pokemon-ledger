/** Stand-in for a Ledger device prompt. Resolve once the device answers. */
export function mockDeviceSignature(approved: boolean): Promise<'ok' | 'rejected'> {
    return new Promise((resolve) => {
        window.setTimeout(() => {
            resolve(approved ? 'ok' : 'rejected');
        }, 1100);
    });
}
