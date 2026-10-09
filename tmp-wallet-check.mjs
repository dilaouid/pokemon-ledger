import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://127.0.0.1:8094/', { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
    const { EventBus } = await import('/src/game/EventBus.ts');
    EventBus.on('current-scene-ready', (scene) => { window.__testScene = scene; });
});
await page.waitForFunction(() => window.__testScene, null, { timeout: 8000 });
await page.locator('#game-container canvas').click();
for (let i = 0; i < 16; i++) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(180);
}
const afterKeyboard = await page.evaluate(() => ({
    key: window.__testScene?.sys?.settings?.key,
    mode: window.__testScene?.mode,
    target: window.__testScene?.box?.target,
    enabled: window.__testScene?.input?.keyboard?.enabled,
}));
for (let i = 0; i < 10; i++) {
    await page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    });
    await page.waitForTimeout(180);
}
const afterDispatch = await page.evaluate(() => ({
    key: window.__testScene?.sys?.settings?.key,
    mode: window.__testScene?.mode,
    target: window.__testScene?.box?.target,
    account: window.__testScene?.registry?.get('walletService')?.selectedAccount?.address ?? null,
}));
console.log(JSON.stringify({ afterKeyboard, afterDispatch }, null, 2));
await browser.close();
