import { GameObjects, Scene } from 'phaser';
import { PALETTE } from '../constants';

export function drawBattleField(scene: Scene): void {
    const graphics = scene.add.graphics();
    graphics.fillStyle(PALETTE.skyHigh, 1);
    graphics.fillRect(0, 0, 160, 36);
    graphics.fillStyle(PALETTE.skyMid, 1);
    graphics.fillRect(0, 36, 160, 36);
    graphics.fillStyle(PALETTE.skyLow, 1);
    graphics.fillRect(0, 72, 160, 72);

    disk(graphics, 118, 62, 28, 7, PALETTE.platform);
    disk(graphics, 118, 64, 28, 7, PALETTE.platformDark);
    disk(graphics, 40, 98, 34, 9, PALETTE.grass);
    disk(graphics, 40, 100, 34, 9, PALETTE.grassDark);

    graphics.fillStyle(PALETTE.white, 1);
    graphics.fillRect(14, 16, 14, 3);
    graphics.fillRect(18, 14, 6, 2);
    graphics.fillRect(96, 24, 18, 3);
}

function disk(
    graphics: GameObjects.Graphics,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    color: number,
): void {
    graphics.fillStyle(color, 1);
    for (let y = -ry; y <= ry; y += 1) {
        const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2)));
        graphics.fillRect(cx - span, cy + y, span * 2, 1);
    }
}
