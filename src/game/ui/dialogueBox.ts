import { GameObjects, Scene } from 'phaser';
import { FONT, PALETTE } from '../constants';
import { addText, normalize, setLine, wrapText } from './text';
import { paintWindow } from './window';

interface ShowOptions {
    instant?: boolean;
    arrow?: boolean;
}

/** Bottom text box with a typewriter and a blinking advance arrow. */
export class DialogueBox {
    private readonly frame: GameObjects.Graphics;
    private readonly nameFrame: GameObjects.Graphics;
    private readonly nameText: GameObjects.BitmapText;
    private readonly body: GameObjects.BitmapText;
    private readonly arrow: GameObjects.Graphics;
    private target = '';
    private shown = 0;
    private elapsed = 0;
    private arrowOn = false;
    private readonly speed = 22;

    constructor(
        scene: Scene,
        private readonly x: number,
        private readonly y: number,
        private readonly w: number,
        h: number,
    ) {
        this.frame = scene.add.graphics();
        paintWindow(this.frame, x, y, w, h);

        this.nameFrame = scene.add.graphics();
        this.nameText = addText(scene, x, y, '');
        this.body = addText(scene, x + 6, y + 6, '');

        this.arrow = scene.add.graphics();
        this.arrow.fillStyle(PALETTE.ink, 1);
        this.arrow.fillTriangle(0, 0, 5, 0, 2, 4);
        this.arrow.setPosition(x + w - 12, y + h - 10);
        this.arrow.setVisible(false);
    }

    setName(name: string): void {
        const label = normalize(name);
        const width = Math.min(this.w - 12, label.length * FONT.cellW + 12);
        const plateX = this.x + 6;
        const plateY = this.y - 12;
        paintWindow(this.nameFrame, plateX, plateY, width, 16);
        this.nameText.setPosition(plateX + 6, plateY + 4);
        setLine(this.nameText, label);
        this.nameText.setVisible(true);
    }

    clearName(): void {
        this.nameFrame.clear();
        setLine(this.nameText, '');
        this.nameText.setVisible(false);
    }

    show(text: string, options: ShowOptions = {}): void {
        const maxChars = Math.max(1, Math.floor((this.w - 12) / FONT.cellW));
        this.target = wrapText(normalize(text), maxChars);
        this.arrowOn = options.arrow ?? true;
        this.elapsed = 0;
        this.arrow.setVisible(false);

        if (options.instant) {
            this.shown = this.target.length;
            setLine(this.body, this.target);
            return;
        }

        this.shown = 0;
        setLine(this.body, '');
    }

    get isComplete(): boolean {
        return this.shown >= this.target.length;
    }

    complete(): void {
        this.shown = this.target.length;
        setLine(this.body, this.target);
    }

    update(time: number, delta: number): void {
        if (!this.isComplete) {
            this.elapsed += delta;
            let changed = false;
            while (this.elapsed >= this.speed && this.shown < this.target.length) {
                this.elapsed -= this.speed;
                this.shown += 1;
                changed = true;
            }
            if (changed) {
                setLine(this.body, this.target.slice(0, this.shown));
            }
            this.arrow.setVisible(false);
            return;
        }

        this.arrow.setVisible(this.arrowOn && Math.floor(time / 420) % 2 === 0);
    }
}
