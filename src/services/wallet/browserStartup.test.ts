import { runInNewContext } from 'node:vm';
import { build } from 'vite';
import { expect, it } from 'vitest';

it('evaluates the browser SDK bundle without a preexisting global Buffer', async () => {
    const output = await build({
        configFile: false,
        logLevel: 'silent',
        build: {
            write: false,
            minify: false,
            lib: { entry: 'src/services/wallet/ledgerSdk.ts', name: 'LedgerSdk', formats: ['iife'] },
        },
    });
    if ('on' in output) throw new Error('Unexpected watch build');
    const bundle = (Array.isArray(output) ? output[0] : output).output.find(item => item.type === 'chunk');
    if (!bundle || bundle.type !== 'chunk') throw new Error('Missing browser bundle');
    // A fresh JS realm has no Node Buffer. Keep the test runner's globals intact.
    const browser: Record<string, unknown> = { TextEncoder, TextDecoder, console, setTimeout, clearTimeout };
    runInNewContext(bundle.code, browser, { timeout: 5000 });
    expect(browser.Buffer).toBeDefined();
    expect(browser.LedgerSdk).toHaveProperty('WalletAPIClient');
}, 30_000);
