import { GameObjects, Scene } from 'phaser';
import { PALETTE } from '../constants';
import type { Creature } from '../types';
import { addText, setLine } from './text';
import { paintWindow } from './window';

/** Green / yellow / red bar that eases toward the real HP. */
export class HpBar {
    private shown: number;
    private goal: number;
    private readonly graphics: GameObjects.Graphics;
    private readonly numbers: GameObjects.BitmapText | null;

    constructor(
        scene: Scene,
        private readonly x: number,
        private readonly y: number,
        private readonly width: number,
        hp: number,
        private readonly max: number,
        withNumbers: boolean,
    ) {
        this.shown = hp;
        this.goal = hp;
        this.graphics = scene.add.graphics();
        this.numbers = withNumbers
            ? addText(scene, x + width, y + 6, `${hp}/${max}`).setOrigin(1, 0)
            : null;
        this.draw();
    }

    setHp(value: number): void {
        this.goal = Math.max(0, Math.min(this.max, value));
    }

    update(): void {
        const delta = this.goal - this.shown;
        if (Math.abs(delta) < 0.2) {
            this.shown = this.goal;
        } else {
            this.shown += delta * 0.35;
        }
        this.draw();
    }

    private draw(): void {
        const ratio = this.max === 0 ? 0 : this.shown / this.max;
        const inner = this.width - 2;
        const filled = Math.max(0, Math.round(inner * Math.min(1, Math.max(0, ratio))));
        const color = ratio > 0.5 ? PALETTE.hpGreen : ratio > 0.2 ? PALETTE.hpYellow : PALETTE.hpRed;

        this.graphics.clear();
        this.graphics.fillStyle(PALETTE.ink, 1);
        this.graphics.fillRect(this.x, this.y, this.width, 5);
        this.graphics.fillStyle(PALETTE.hpTrough, 1);
        this.graphics.fillRect(this.x + 1, this.y + 1, inner, 3);
        this.graphics.fillStyle(color, 1);
        this.graphics.fillRect(this.x + 1, this.y + 1, filled, 3);

        if (this.numbers) {
            setLine(this.numbers, `${Math.ceil(this.shown)}/${this.max}`);
        }
    }
}

export class StatusPanel {
    private readonly bar: HpBar;

    constructor(scene: Scene, x: number, y: number, w: number, h: number, creature: Creature, numbers: boolean) {
        const frame = scene.add.graphics();
        paintWindow(frame, x, y, w, h);
        addText(scene, x + 6, y + 4, creature.name);
        addText(scene, x + w - 6, y + 4, `L${creature.level}`).setOrigin(1, 0);
        addText(scene, x + 6, y + 14, 'HP');
        this.bar = new HpBar(scene, x + 22, y + 16, w - 30, creature.hp, creature.hp, numbers);
    }

    setHp(value: number): void {
        this.bar.setHp(value);
    }

    update(): void {
        this.bar.update();
    }
}
