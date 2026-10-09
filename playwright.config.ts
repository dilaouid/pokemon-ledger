import { defineConfig } from '@playwright/test';

const port = process.env.PLAYWRIGHT_PORT ?? '8091';

export default defineConfig({
    testDir: './e2e',
    timeout: 45_000,
    use: { baseURL: `http://127.0.0.1:${port}`, headless: true, screenshot: 'only-on-failure', viewport: { width: 1280, height: 800 } },
    webServer: {
        command: `pnpm dev --host 127.0.0.1 --port ${port} --strictPort`,
        url: `http://127.0.0.1:${port}`,
        env: { VITE_WALLET_MODE: 'mock' },
        reuseExistingServer: false,
    },
});
