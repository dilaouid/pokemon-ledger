import { GameObjects, Scene } from 'phaser';
import { blip } from '../audio/blip';
import { playMusic } from '../audio/music';
import { AUDIO, PALETTE, SCENES, trainerFaceKey, trainerSpriteKey } from '../constants';
import { TRAINERS } from '../content/trainers';
import { readRun } from '../state/runState';
import type { BattleLaunch, Trainer } from '../types';
import { DialogueBox } from '../ui/dialogueBox';
import { fitHeight } from '../ui/fit';
import { fadeTo, openScene, type Controls } from '../ui/flow';
import { addText, setLine } from '../ui/text';
import { makeArrow } from '../ui/window';
import { ALL_TRAINERS_MASK } from '../../domain/battleRules';
import type { GameController } from '../controllers/GameController';

type Mode = 'browse' | 'talk';
type AfterTalk = 'battle' | 'browse';

interface LadderReturn {
    trainerId?: string;
    result?: 'win' | 'loss';
    hash?: string;
}

/** Horizontal trainer ladder. Confirm plays their challenge, then the fight. */
export class OpponentsScene extends Scene {
    private controls!: Controls;
    private ready = false;
    private index = 0;
    private line = 0;
    private mode: Mode = 'browse';
    private afterTalk: AfterTalk = 'battle';
    private script: readonly string[] = [];
    private pending: LadderReturn | null = null;
    private face!: GameObjects.Image;
    private body!: GameObjects.Image;
    private arrows: GameObjects.Graphics[] = [];
    private pips!: GameObjects.Graphics;
    private badge!: GameObjects.Graphics;
    private counter!: GameObjects.BitmapText;
    private box!: DialogueBox;

    constructor() {
        super(SCENES.opponents);
    }

    init(data: LadderReturn = {}): void {
        if ((data.result === 'win' || data.result === 'loss') && data.trainerId) {
            this.pending = data;
            return;
        }
        this.pending = null;
    }

    create(): void {
        const run = readRun(this);
        if (!run.starterId) {
            this.scene.start(SCENES.starter);
            return;
        }

        playMusic(this, AUDIO.menu);
        this.controls = openScene(this);
        this.ready = false;
        this.mode = 'browse';
        this.line = 0;
        if (this.index >= TRAINERS.length) {
            this.index = 0;
        }

        this.cameras.main.setBackgroundColor(0x102038);
        addText(this, 4, 3, 'TRAINERS', PALETTE.gold);
        this.counter = addText(this, 156, 3, '', PALETTE.white).setOrigin(1, 0);

        const first = TRAINERS[0];
        if (!first) {
            this.box = new DialogueBox(this, 0, 104, 160, 40);
            this.box.show('NO TRAINERS YET.', { instant: true, arrow: false });
            return;
        }

        this.face = this.add.image(80, 22, trainerFaceKey(first.id)).setOrigin(0.5, 0);
        this.body = this.add.image(108, 96, trainerFaceKey(first.id)).setOrigin(0.5, 1).setVisible(false);
        this.pips = this.add.graphics();
        this.badge = this.add.graphics();
        this.arrows = [
            makeArrow(this, 4, 48, -1, PALETTE.gold),
            makeArrow(this, 150, 48, 1, PALETTE.gold),
        ];

        this.box = new DialogueBox(this, 0, 104, 160, 40);
        const pending = this.pending;
        this.pending = null;
        if (pending?.trainerId && pending.result) {
            const found = TRAINERS.findIndex((trainer) => trainer.id === pending.trainerId);
            if (found >= 0) {
                this.index = found;
                setLine(this.counter, `${this.clearedCount()}/${TRAINERS.length}`);
                this.startTalk(this.resultLines(TRAINERS[found], pending), 'browse');
                this.ready = true;
                return;
            }
        }

        this.showBrowse();
        this.ready = true;
    }

    update(time: number, delta: number): void {
        if (!this.ready) {
            return;
        }

        this.box.update(time, delta);
        const pulse = this.mode === 'browse' ? 0.45 + 0.55 * Math.abs(Math.sin(time / 280)) : 0.25;
        this.arrows.forEach((arrow) => arrow.setAlpha(pulse));

        if (this.mode === 'talk') {
            this.updateTalk();
            return;
        }

        if (this.controls.left()) {
            this.index = (this.index + TRAINERS.length - 1) % TRAINERS.length;
            blip(330, 0.025);
            this.showBrowse();
            return;
        }

        if (this.controls.right()) {
            this.index = (this.index + 1) % TRAINERS.length;
            blip(330, 0.025);
            this.showBrowse();
            return;
        }

        if (!this.controls.confirm()) {
            return;
        }

        const trainer = TRAINERS[this.index];
        const run = readRun(this);
        if (run.defeatedIds.includes(trainer.id)) return;
        if (trainer.id === 'panoramix' && (this.registry.get('gameController') as GameController).getSnapshot().player?.defeatedMask !== ALL_TRAINERS_MASK) {
            this.box.show('DEFEAT ALL 13\nTRAINERS FIRST.', { instant: true, arrow: false });
            return;
        }
        blip(480, 0.04);
        this.startTalk(trainer.beforeFight, 'battle');
    }

    private updateTalk(): void {
        if (this.afterTalk === 'battle' && this.controls.cancel()) {
            this.mode = 'browse';
            blip(220, 0.04);
            this.showBrowse();
            return;
        }

        if (!this.controls.confirm()) {
            return;
        }

        if (!this.box.isComplete) {
            this.box.complete();
            return;
        }

        this.line += 1;
        if (this.line >= this.script.length) {
            if (this.afterTalk === 'battle') {
                const launch: BattleLaunch = { trainerId: TRAINERS[this.index].id };
                fadeTo(this, SCENES.battle, launch);
                return;
            }
            this.mode = 'browse';
            this.showBrowse();
            return;
        }

        blip(420, 0.03);
        this.playLine();
    }

    private showBrowse(): void {
        const trainer = TRAINERS[this.index];
        const run = readRun(this);
        setLine(this.counter, `${this.clearedCount()}/${TRAINERS.length}`);
        this.place(trainer);

        const state = run.defeatedIds.includes(trainer.id) ? 'CLEARED' : trainer.id === 'panoramix' && run.defeatedIds.length < 13 ? 'LOCKED' : 'OPEN';
        this.box.setName(trainer.name);
        this.box.show(`${state}  ENTER`, {
            instant: true,
            arrow: false,
        });
    }

    private startTalk(script: readonly string[], after: AfterTalk): void {
        this.script = script;
        this.afterTalk = after;
        this.mode = 'talk';
        this.line = 0;
        this.playLine();
    }

    private resultLines(trainer: Trainer, pending: LadderReturn): readonly string[] {
        if (pending.result === 'win') {
            return [...trainer.onWin, 'YOU GOT THE TROPHY!'];
        }
        return trainer.onLose;
    }

    private playLine(): void {
        const trainer = TRAINERS[this.index];
        this.place(trainer);
        this.box.setName(trainer.name);
        this.box.show(this.script[this.line]);
    }

    private clearedCount(): number {
        const run = readRun(this);
        return TRAINERS.filter((entry) => run.defeatedIds.includes(entry.id)).length;
    }

    private place(trainer: Trainer): void {
        this.face.setTexture(trainerFaceKey(trainer.id));
        const spriteKey = trainerSpriteKey(trainer.id);
        if (trainer.spriteUrl && this.textures.exists(spriteKey)) {
            this.body.setTexture(spriteKey).setVisible(true);
            fitHeight(this.body, 74);
            this.face.setPosition(28, 24);
            fitHeight(this.face, 40);
        } else {
            this.body.setVisible(false);
            this.face.setPosition(80, 22);
            fitHeight(this.face, 66);
        }

        this.drawPips();
        this.drawBadge(readRun(this).defeatedIds.includes(trainer.id));
    }

    /** One square per trainer: green if beaten, gold if this is the one on screen. */
    private drawPips(): void {
        const run = readRun(this);
        this.pips.clear();
        const gap = 8;
        const start = Math.round((160 - TRAINERS.length * gap) / 2);
        TRAINERS.forEach((trainer, index) => {
            const selected = index === this.index;
            const cleared = run.defeatedIds.includes(trainer.id);
            const x = start + index * gap;
            const y = 13;
            if (selected && cleared) {
                this.pips.fillStyle(PALETTE.gold, 1);
                this.pips.fillRect(x - 1, y - 1, 7, 7);
                this.pips.fillStyle(PALETTE.cleared, 1);
                this.pips.fillRect(x + 1, y + 1, 3, 3);
                return;
            }
            this.pips.fillStyle(selected ? PALETTE.gold : cleared ? PALETTE.cleared : PALETTE.locked, 1);
            this.pips.fillRect(x - (selected ? 1 : 0), y - (selected ? 1 : 0), selected ? 5 : 3, selected ? 5 : 3);
        });
    }

    /** Green frame and a check, sitting on the portrait of a beaten trainer. */
    private drawBadge(cleared: boolean): void {
        this.badge.clear();
        if (!cleared) {
            return;
        }

        const left = Math.round(this.face.x - this.face.displayWidth / 2);
        const top = Math.round(this.face.y);
        const width = Math.round(this.face.displayWidth);
        const height = Math.round(this.face.displayHeight);

        this.badge.fillStyle(PALETTE.cleared, 1);
        this.badge.fillRect(left - 1, top - 1, width + 2, 2);
        this.badge.fillRect(left - 1, top + height - 1, width + 2, 2);
        this.badge.fillRect(left - 1, top, 2, height);
        this.badge.fillRect(left + width - 1, top, 2, height);

        const x = left + width - 12;
        const y = top - 2;
        this.badge.fillStyle(PALETTE.ink, 1);
        this.badge.fillRect(x - 1, y - 1, 14, 14);
        this.badge.fillStyle(PALETTE.cleared, 1);
        this.badge.fillRect(x, y, 12, 12);
        this.badge.fillStyle(PALETTE.ink, 1);
        this.badge.fillRect(x + 2, y + 6, 2, 2);
        this.badge.fillRect(x + 4, y + 8, 3, 2);
        this.badge.fillRect(x + 6, y + 6, 2, 2);
        this.badge.fillRect(x + 8, y + 4, 2, 2);
    }
}
