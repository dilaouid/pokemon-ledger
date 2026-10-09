import { GameObjects, Scene } from 'phaser';
import { PALETTE } from '../constants';

/** Classic cream window: black, paper, black, paper. */
export function paintWindow(graphics: GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    graphics.clear();
    graphics.fillStyle(PALETTE.ink, 1);
    graphics.fillRect(x, y, w, h);
    graphics.fillStyle(PALETTE.paper, 1);
    graphics.fillRect(x + 1, y + 1, w - 2, h - 2);
    graphics.fillStyle(PALETTE.ink, 1);
    graphics.fillRect(x + 2, y + 2, w - 4, h - 4);
    graphics.fillStyle(PALETTE.paper, 1);
    graphics.fillRect(x + 3, y + 3, w - 6, h - 6);
}

export function makeArrow(
    scene: Scene,
    x: number,
    y: number,
    dir: -1 | 1,
    color: number,
): GameObjects.Graphics {
    const arrow = scene.add.graphics();
    arrow.fillStyle(color, 1);
    if (dir < 0) {
        arrow.fillTriangle(6, 0, 6, 8, 0, 4);
    } else {
        arrow.fillTriangle(0, 0, 0, 8, 6, 4);
    }
    arrow.setPosition(x, y);
    return arrow;
}
