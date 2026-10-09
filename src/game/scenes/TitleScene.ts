import { GameObjects, Scene } from 'phaser';
import { blip } from '../audio/blip';
import { playMusic } from '../audio/music';
import { AUDIO, FONT, PALETTE, SCENES, TEXTURE } from '../constants';
import { VIDEOS } from '../data/videos';
import { addText } from '../ui/text';
import { fadeTo, openScene, type Controls } from '../ui/flow';
import { VideoSlot } from '../ui/videoSlot';

const INTRO_MS = 4200;
const TITLE = 'POK\u00C9MON';

export class TitleScene extends Scene {
    private controls!: Controls;
    private slot!: VideoSlot;
    private phase: 'tape' | 'menu' = 'tape';
    private elapsed = 0;
    private ball!: GameObjects.Image;
    private prompt!: GameObjects.BitmapText;
    private skip!: GameObjects.BitmapText;
    private skipBand!: GameObjects.Graphics;
    private menuBits: Array<{ setVisible(value: boolean): void }> = [];

    constructor() {
        super(SCENES.title);
    }

    create(): void {
        this.controls = openScene(this);
        this.cameras.main.setBackgroundColor(PALETTE.night);
        this.slot = new VideoSlot(this);
        this.slot.play(VIDEOS.intro, () => this.showMenu());

        this.skipBand = this.add.graphics().setDepth(6);
        this.skipBand.fillStyle(0x081018, 0.8);
        this.skipBand.fillRect(0, 116, 160, 28);
        this.skip = addText(this, 80, 124, 'ENTER SKIPS', PALETTE.white).setOrigin(0.5, 0).setDepth(7);

        const band = this.add.graphics().setDepth(3);
        band.fillStyle(0x081018, 0.66);
        band.fillRect(6, 46, 148, 82);

        this.ball = this.add.image(80, 32, TEXTURE.seal).setScale(2).setDepth(4);
        const shadow = PALETTE.ink;
        const titleSize = FONT.cellW * 2;
        const titleBack = addText(this, 81, 55, TITLE, shadow, titleSize).setOrigin(0.5, 0).setDepth(4);
        const title = addText(this, 80, 54, TITLE, PALETTE.gold, titleSize).setOrigin(0.5, 0).setDepth(5);
        const ledgerBack = addText(this, 81, 73, 'LEDGER', shadow, titleSize).setOrigin(0.5, 0).setDepth(4);
        const ledger = addText(this, 80, 72, 'LEDGER', PALETTE.white, titleSize).setOrigin(0.5, 0).setDepth(5);
        const subtitle = addText(this, 80, 94, 'ON SEPOLIA', PALETTE.gold).setOrigin(0.5, 0).setDepth(5);
        this.prompt = addText(this, 80, 116, 'PRESS ENTER', PALETTE.white).setOrigin(0.5, 0).setDepth(5);

        this.menuBits = [band, this.ball, titleBack, title, ledgerBack, ledger, subtitle, this.prompt];
        this.setMenu(false);
        playMusic(this, AUDIO.intro);
    }

    update(time: number, delta: number): void {
        this.slot.update(time);

        const blink = Math.floor(time / 420) % 2 === 0;

        if (this.phase === 'tape') {
            if (this.slot.isLiveVideo) {
                this.slot.setCaption('ENTER SKIPS', blink);
            } else {
                this.elapsed += delta;
                this.skip.setVisible(blink);
            }
            const finished = !this.slot.isLiveVideo && this.elapsed >= INTRO_MS;
            if (finished || this.controls.confirm() || this.controls.cancel()) {
                this.showMenu();
            }
            return;
        }

        if (this.slot.isLiveVideo) {
            this.slot.setCaption('PRESS ENTER', blink);
        } else {
            this.ball.y = 32 + Math.round(Math.sin(time / 380) * 2);
            this.prompt.setVisible(blink);
        }
        if (this.controls.confirm()) {
            this.slot.dismiss();
            fadeTo(this, SCENES.intro);
        }
    }

    private showMenu(): void {
        if (this.phase === 'menu') {
            return;
        }
        this.phase = 'menu';
        this.slot.play(VIDEOS.titleLoop);
        this.setMenu(!this.slot.isLiveVideo);
        blip(520, 0.04);
    }

    private setMenu(visible: boolean): void {
        this.menuBits.forEach((bit) => bit.setVisible(visible));
        const skip = !visible && !this.slot.isLiveVideo;
        this.skip.setVisible(skip);
        this.skipBand.setVisible(skip);
    }
}
