import type { GameObjects } from 'phaser';

/** Scale a sprite so its unscaled frame height matches `height` in screen pixels. */
export function fitHeight(image: GameObjects.Image, height: number): void {
    const source = image.frame.realHeight || image.frame.height;
    image.setScale(height / source);
}
