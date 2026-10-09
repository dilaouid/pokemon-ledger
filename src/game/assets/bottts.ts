import type { GameObjects, Scene } from 'phaser';

export function botttsUrl(address: string): string {
    return `https://api.dicebear.com/10.x/bottts/svg?seed=${encodeURIComponent(address.toLowerCase())}`;
}

/** Keep the local sprite usable while the optional remote avatar loads. */
export function applyBottts(scene: Scene, sprite: GameObjects.Image, address: string, size: number): void {
    const key = `bottts:${address.toLowerCase()}`;
    const apply = () => {
        // A failed request must leave the painted pixel sprite in place.
        if (!sprite.active || !scene.textures.exists(key)) return;
        const texture = scene.textures.get(key);
        if (texture.source[0]?.width === 0 || texture.source[0]?.height === 0) return;
        sprite.setTexture(key).setDisplaySize(size, size).setFlipX(false);
    };
    if (scene.textures.exists(key)) { apply(); return; }

    // WebGL cannot reliably upload an SVG image directly with texImage2D.
    // Draw it into a bitmap canvas first so Phaser only receives RGBA pixels.
    const image = new Image();
    image.crossOrigin = 'anonymous';
    let stopped = false;
    const cleanup = () => {
        stopped = true;
        image.onload = null;
        image.onerror = null;
    };
    scene.events.once('shutdown', cleanup);
    image.onload = () => {
        if (stopped || !sprite.active) return;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const context = canvas.getContext('2d');
            if (!context) return;
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            if (!scene.textures.exists(key)) scene.textures.addCanvas(key, canvas);
            apply();
        } catch {
            // Network/CORS/rasterization failures deliberately keep the local sprite.
        } finally {
            scene.events.off('shutdown', cleanup);
            cleanup();
        }
    };
    image.onerror = () => {
        scene.events.off('shutdown', cleanup);
        cleanup();
    };
    image.src = botttsUrl(address);
}
