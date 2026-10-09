import { expect, test, type Page } from '@playwright/test';

async function sceneValue(page: Page, expression: string) {
    return page.evaluate(`window.__testScene && (${expression})`);
}
async function reach(page: Page, key: string) {
    for (let i = 0; i < 90; i++) {
        if (await sceneValue(page, 'window.__testScene.sys.settings.key') === key) return;
        await page.keyboard.press('Enter', { delay: 60 });
        await page.waitForTimeout(80);
    }
    throw new Error(`Did not reach ${key}: ${await sceneValue(page, "window.__testScene.sys.settings.key")} / ${await page.locator("body").innerText()}`);
}
async function start(page: Page) {
    page.on('pageerror', error => console.error('Browser error:', error.stack));
    await page.goto('/');
    await page.evaluate(async () => {
        // Read the application's real scene notifications; no production test hook.
        const { EventBus } = await import('/src/game/EventBus.ts');
        EventBus.on('current-scene-ready', (scene: unknown) => { (window as any).__testScene = scene; });
    });
    await reach(page, 'Intro');
}

test('mock intro, deterministic starter, boss lock, trap approval/refusal and battle', async ({ page }) => {
    await page.route('https://api.dicebear.com/**', route => route.fulfill({
        contentType: 'image/svg+xml',
        headers: { 'access-control-allow-origin': '*' },
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="orange"/></svg>',
    }));
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await start(page);
    await reach(page, 'Starter');
    await expect.poll(() => sceneValue(page, 'window.__testScene.sprite.texture.key')).toMatch(/^bottts:0x/);
    expect(await sceneValue(page, 'window.__testScene.sprite.displayWidth')).toBe(48);
    const initialStats = await sceneValue(page, 'window.__testScene.mon');
    await page.keyboard.press('ArrowRight', { delay: 60 });
    expect(await sceneValue(page, 'window.__testScene.mon')).toEqual(initialStats);
    await reach(page, 'Opponents');
    // Panoramix is at the end of the unchanged horizontal ladder.
    await page.keyboard.press('ArrowLeft', { delay: 60 });
    await page.keyboard.press('Enter', { delay: 60 });
    expect(await sceneValue(page, 'window.__testScene.sys.settings.key')).toBe('Opponents');
    await expect.poll(() => sceneValue(page, 'window.__testScene.box.target')).toContain('DEFEAT ALL 13');
    await page.keyboard.press('ArrowRight', { delay: 60 }); // Teddy
    await page.keyboard.press('ArrowRight', { delay: 60 }); // Benoit
    await page.keyboard.press('ArrowRight', { delay: 60 }); // Diyaeddine
    await reach(page, 'Battle');
    await expect.poll(() => sceneValue(page, 'window.__testScene.enemySprite.texture.key')).toMatch(/^bottts:0x/);
    expect(await sceneValue(page, 'window.__testScene.playerSprite.displayWidth')).toBe(40);
    for (let i = 0; i < 30; i++) {
        if (await sceneValue(page, 'window.__testScene.phase') === 'trap') break;
        await page.keyboard.press('Enter', { delay: 60 }); await page.waitForTimeout(80);
    }
    await expect.poll(() => sceneValue(page, 'window.__testScene.phase')).toBe('trap');
    await page.keyboard.press('Enter', { delay: 60 });
    await expect.poll(() => sceneValue(page, 'window.__testScene.trapChecked')).toBe(true);
    for (let i = 0; i < 20; i++) {
        if (await sceneValue(page, 'window.__testScene.outcome') === 'loss') break;
        await page.keyboard.press('Enter', { delay: 60 }); await page.waitForTimeout(80);
    }
    await expect.poll(() => sceneValue(page, 'window.__testScene.outcome')).toBe('loss');
    await reach(page, 'Opponents');
    expect(await sceneValue(page, 'window.__testScene.registry.get("gameController").getSnapshot().player.defeatedMask')).toBe(0);
    await reach(page, 'Battle');
    for (let i = 0; i < 30; i++) {
        if (await sceneValue(page, 'window.__testScene.phase') === 'trap') break;
        await page.keyboard.press('Enter', { delay: 60 }); await page.waitForTimeout(80);
    }
    await page.keyboard.press('Escape', { delay: 60 });
    await expect.poll(() => sceneValue(page, 'window.__testScene.trapChecked')).toBe(true);
    await reach(page, 'Opponents');
    expect(await sceneValue(page, 'window.__testScene.registry.get("gameController").getSnapshot().player.defeatedMask')).toBe(4);
    expect(await sceneValue(page, 'window.__testScene.registry.get("gameController").getSnapshot().rewards.length')).toBe(2);
    expect(errors).toEqual([]);
    await page.screenshot({ path: 'test-results/mock-ladder.png' });
});

test('choosing girl in the anthony intro continues into the game', async ({ page }) => {
    await page.route('https://api.dicebear.com/**', route => route.abort());
    await start(page);
    for (let i = 0; i < 40; i++) {
        const target = await sceneValue(page, 'window.__testScene.box && window.__testScene.box.target');
        if (typeof target === 'string' && target.includes('GIRL')) break;
        await page.keyboard.press('Enter', { delay: 60 });
        await page.waitForTimeout(60);
    }
    expect(await sceneValue(page, 'window.__testScene.box.target')).toContain('GIRL');
    await page.keyboard.press('ArrowDown', { delay: 60 });
    await page.keyboard.press('Enter', { delay: 60 });
    await reach(page, 'Starter');
    await expect(page.getByText('u not true gamer')).toHaveCount(0);
});

test('mock intro refusal keeps the original shutdown behavior', async ({ page }) => {
    await start(page);
    for (let i = 0; i < 50; i++) {
        if (await sceneValue(page, 'window.__testScene.mode') === 'sign') break;
        await page.keyboard.press('Enter', { delay: 60 }); await page.waitForTimeout(60);
    }
    await page.keyboard.press('Escape', { delay: 60 });
    await expect(page.getByText('u not true gamer')).toBeVisible({ timeout: 8000 });
});
