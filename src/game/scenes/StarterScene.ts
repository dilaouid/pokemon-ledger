import { applyBottts } from '../assets/bottts';
import { GameObjects, Scene } from 'phaser';
import { blip } from '../audio/blip';
import { playMusic } from '../audio/music';
import { AUDIO, PALETTE, SCENES, frontKey } from '../constants';
import { STARTERS } from '../data/creatures';
import { deriveStarter } from '../../domain/deriveStarter';
import type { WalletAccount } from '../../services/wallet/WalletService';
import type { Creature } from '../types';
import type { GameController } from '../controllers/GameController';
import { DialogueBox } from '../ui/dialogueBox';
import { fadeTo, openScene, type Controls } from '../ui/flow';
import { addText, setLine } from '../ui/text';

export class StarterScene extends Scene {
    private controls!: Controls;
    private index = 0;
    private picked = false;
    private sprite!: GameObjects.Image;
    private name!: GameObjects.BitmapText;
    private stats!: GameObjects.BitmapText;
    private move!: GameObjects.BitmapText;
    private count!: GameObjects.BitmapText;
    private box!: DialogueBox;
    private mon!: Creature;
    private controller!: GameController;
    private waiting = false;
    private prompt = '';

    constructor() {
        super(SCENES.starter);
    }

    create(): void {
        this.controls = openScene(this);
        this.controller = this.registry.get('gameController') as GameController;
        this.waiting = false;
        const account = this.registry.get('walletAccount') as WalletAccount | undefined;
        if (!account) { this.scene.start(SCENES.intro); return; }
        playMusic(this, AUDIO.menu);
        const derived = deriveStarter(account.address);
        this.index = derived.speciesId;
        this.mon = { ...STARTERS[this.index], ...derived };
        this.picked = false;
        this.cameras.main.setBackgroundColor(0x183058);

        addText(this, 80, 4, 'YOUR PARTNER', PALETTE.white).setOrigin(0.5, 0);
        this.count = addText(this, 152, 4, '', PALETTE.gold).setOrigin(1, 0);
        this.sprite = this.add.image(80, 62, frontKey(STARTERS[0].id)).setOrigin(0.5, 1).setScale(3);
        this.name = addText(this, 80, 66, '', PALETTE.gold).setOrigin(0.5, 0);
        this.stats = addText(this, 80, 76, '', PALETTE.white).setOrigin(0.5, 0);
        this.move = addText(this, 80, 86, '', PALETTE.white).setOrigin(0.5, 0);
        this.box = new DialogueBox(this, 0, 104, 160, 40);
        this.refresh();
        applyBottts(this, this.sprite, account.address, 48);
    }

    update(time: number, delta: number): void {
        this.box.update(time, delta);
        this.syncPrompt();
        if (this.waiting || this.controller.getSnapshot().busy) return;

        if (this.picked) {
            if (this.controls.confirm()) {
                fadeTo(this, SCENES.opponents);
            }
            return;
        }

        if (this.controls.cancel()) {
            fadeTo(this, SCENES.intro);
            return;
        }

        if (!this.controls.confirm()) {
            return;
        }

        void this.claim();
    }

    private async claim(): Promise<void> {
        this.waiting = true;
        this.box.show('CHECK YOUR LEDGER...', { instant: true, arrow: false });
        try {
            await this.controller.initialize();
            if (this.controller.getSnapshot().needsDeployment) {
                this.box.show('DEPLOY THE GAME IN\nTHE WALLET PANEL.', { instant: true, arrow: false });
                return;
            }
            if (!this.controller.getSnapshot().player?.starterTokenId) await this.controller.claimStarter();
            if (!this.scene.isActive()) return;
            this.picked = true;
            blip(620, 0.05);
            this.box.show(`${this.mon.name} JOINED\nTHE LEDGER. ENTER!`, { instant: true, arrow: true });
        } catch {
            if (this.scene.isActive()) this.box.show('CHECK WALLET PANEL.\nENTER TO RETRY.', { instant: true, arrow: false });
        } finally { this.waiting = false; }
    }

    private refresh(): void {
        const mon = this.mon;
        this.sprite.setTexture(frontKey(mon.id));
        setLine(this.name, mon.name);
        setLine(this.stats, `ATK ${mon.attack}  DEF ${mon.defense}`);
        setLine(this.move, `HP ${mon.hp}  MOVE ${mon.move}`);
        setLine(this.count, '');
        this.syncPrompt();
    }

    private syncPrompt(): void {
        if (this.picked || this.waiting) return;
        const state = this.controller.getSnapshot();
        const text = state.needsDeployment
            ? 'DEPLOY THE GAME IN\nTHE WALLET PANEL.'
            : state.busy
                ? state.transaction.message
                : `${this.mon.blurb}\nENTER TO ${state.player?.starterTokenId ? 'CONTINUE' : 'CLAIM'}`;
        if (text === this.prompt) return;
        this.prompt = text;
        this.box.show(text, { instant: true, arrow: false });
    }
}
