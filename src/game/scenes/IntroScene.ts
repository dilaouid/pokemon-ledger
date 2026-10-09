import { Cameras, GameObjects, Scene } from 'phaser';
import { blip } from '../audio/blip';
import { playMusic, stopMusic } from '../audio/music';
import { managerMessage, WalletError, type WalletService } from '../../services/wallet/WalletService';
import { AUDIO, SCENES, TEXTURE } from '../constants';
import { INTRO_STEPS, type IntroStep } from '../data/dialogue';
import { EventBus } from '../EventBus';
import { DialogueBox } from '../ui/dialogueBox';
import { fitHeight } from '../ui/fit';
import { fadeTo, openScene, type Controls } from '../ui/flow';
import type { GameController } from '../controllers/GameController';

type Mode = 'text' | 'choice' | 'sign' | 'loading' | 'success' | 'error' | 'off' | 'wallet-error';

export class IntroScene extends Scene {
    private controls!: Controls;
    private box!: DialogueBox;
    private anthony!: GameObjects.Image;
    private alpaca!: GameObjects.Image;
    private stepIndex = 0;
    private choice = 0;
    private answer: 'yes' | 'no' = 'yes';
    private deviceApproved = true;
    private mode: Mode = 'text';
    private offArmed = false;
    private closing = false;
    private wallet!: WalletService;
    private requestVersion = 0;
    private reloadRequired = false;

    constructor() {
        super(SCENES.intro);
    }

    create(): void {
        this.controls = openScene(this);
        this.wallet = this.registry.get('walletService') as WalletService;
        this.requestVersion += 1;
        this.reloadRequired = false;
        this.events.once('shutdown', () => { this.requestVersion += 1; });
        this.stepIndex = 0;
        this.choice = 0;
        this.answer = 'yes';
        this.deviceApproved = true;
        this.mode = 'text';
        this.offArmed = false;
        this.closing = false;

        this.drawRoom();
        this.alpaca = this.add.image(112, 104, TEXTURE.alpaca).setOrigin(0.5, 1).setFlipX(true).setVisible(false);
        fitHeight(this.alpaca, 126);
        this.anthony = this.add.image(134, 102, TEXTURE.anthonySprite).setOrigin(0.5, 1);
        fitHeight(this.anthony, 92);

        this.box = new DialogueBox(this, 0, 100, 160, 44);
        this.box.setName('ANTHONY');
        playMusic(this, AUDIO.intro);
        this.present(0);
    }

    update(time: number, delta: number): void {
        this.box.update(time, delta);
        if (this.mode === 'loading' || this.mode === 'off') {
            return;
        }

        if (this.mode === 'wallet-error') {
            if (!this.reloadRequired && this.controls.confirm()) void this.authenticate();
            return;
        }

        if (this.mode === 'error' && this.box.isComplete) {
            this.armOff();
        }

        if (this.mode === 'choice') {
            this.updateChoice();
            return;
        }

        if (this.mode === 'sign') {
            this.updateSign();
            return;
        }

        if (!this.controls.confirm()) {
            return;
        }

        if (!this.box.isComplete) {
            this.box.complete();
            return;
        }

        if (this.mode === 'error') {
            this.powerOff();
            return;
        }

        if (this.mode === 'success') {
            fadeTo(this, SCENES.starter);
            return;
        }

        blip(420, 0.03);
        this.advance();
    }

    private updateChoice(): void {
        const previous = this.choice;
        if (this.controls.up() || this.controls.left()) {
            this.choice = 0;
        } else if (this.controls.down() || this.controls.right()) {
            this.choice = 1;
        }

        if (this.choice !== previous) {
            blip(340, 0.025);
            this.renderChoice();
            return;
        }

        if (!this.controls.confirm()) {
            return;
        }

        this.answer = this.choice === 0 ? 'yes' : 'no';
        blip(480, 0.04);
        this.present(this.stepIndex + 1);
    }

    private updateSign(): void {
        if (this.controls.confirm()) {
            this.deviceApproved = true;
            blip(520, 0.04);
            this.present(this.stepIndex + 1);
            return;
        }

        if (this.controls.cancel()) {
            this.deviceApproved = false;
            blip(180, 0.06);
            this.present(this.stepIndex + 1);
        }
    }

    private advance(): void {
        const step = INTRO_STEPS[this.stepIndex];
        if (step?.kind === 'branch' && step.refuse && this.answer === 'no') {
            this.present(this.errorAt('refuse'));
            return;
        }
        this.present(this.stepIndex + 1);
    }

    private present(index: number): void {
        const step = INTRO_STEPS[index];
        if (!step) {
            return;
        }

        this.stepIndex = index;
        this.alpaca.setVisible(step.kind === 'text' && step.alpaca === true);

        if (step.kind === 'text' || step.kind === 'success' || step.kind === 'error') {
            this.mode = step.kind === 'text' ? 'text' : step.kind;
            this.box.show(step.text);
            return;
        }

        if (step.kind === 'branch') {
            this.mode = 'text';
            this.box.show(this.answer === 'yes' ? step.yes : step.no);
            return;
        }

        if (step.kind === 'choice') {
            this.mode = 'choice';
            this.choice = 0;
            this.renderChoice();
            return;
        }

        if (step.kind === 'sign') {
            if (this.wallet.mode === 'ledger') {
                void this.authenticate();
                return;
            }
            this.mode = 'sign';
            this.box.show(step.text, { instant: true, arrow: false });
            return;
        }

        this.mode = 'loading';
        this.box.show(step.text, { instant: true, arrow: false });
        void this.authenticate();
    }

    private async authenticate(): Promise<void> {
        const version = ++this.requestVersion;
        const active = () => version === this.requestVersion && this.scene.isActive();
        this.mode = 'loading';
        this.box.show(this.wallet.selectedAccount ? 'CHECKING ACCOUNT...' : 'SELECT SEPOLIA\nACCOUNT IN WALLET.', { instant: true, arrow: false });
        try {
            const account = await this.wallet.selectAccount();
            if (!active()) return;
            this.registry.set('walletAccount', account);
            this.box.show(this.wallet.mode === 'mock' ? 'LOOKING AT YOUR\nWALLET...' : 'JOIN THE TEAM WITH YOUR LEDGER DEVICE!.', { instant: true, arrow: false });
            const message = managerMessage();
            const signature = await this.wallet.signMessage(message, this.deviceApproved);
            if (!active()) return;
            this.registry.set('walletAuthentication', { account, message, signature, mode: this.wallet.mode });
            this.box.show('LOADING PROGRESS...', { instant: true, arrow: false });
            await (this.registry.get('gameController') as GameController).initialize();
            if (!active()) return;
            this.present(this.successAt());
        } catch (error) {
            if (!active()) return;
            this.registry.remove('walletAuthentication');
            if (this.wallet.mode === 'mock' && error instanceof WalletError && error.code === 'REJECTED') {
                this.present(this.errorAt('device'));
                return;
            }
            this.mode = 'wallet-error';
            this.reloadRequired = error instanceof WalletError && ['TIMEOUT', 'ACCOUNT_CHANGED'].includes(error.code);
            const message = error instanceof WalletError ? error.message : 'Wallet request failed.';
            this.box.show(`${message}\n${this.reloadRequired ? 'RELOAD THE GAME.' : 'ENTER TO RETRY.'}`, { instant: true, arrow: false });
        }
    }

    private renderChoice(): void {
        const step = INTRO_STEPS[this.stepIndex];
        if (step?.kind !== 'choice') {
            return;
        }

        const lines = step.options.map((option, index) => `${index === this.choice ? '>' : ' '} ${option}`);
        this.box.show(`${step.text}\n${lines.join('\n')}`, { instant: true, arrow: false });
    }

    private successAt(): number {
        const index = INTRO_STEPS.findIndex((step) => step.kind === 'success');
        if (index < 0) {
            throw new Error('Intro is missing its success line.');
        }
        return index;
    }

    private errorAt(id: Extract<IntroStep, { kind: 'error' }>['id']): number {
        const index = INTRO_STEPS.findIndex((step) => step.kind === 'error' && step.id === id);
        if (index < 0) {
            throw new Error(`Intro is missing the ${id} line.`);
        }
        return index;
    }

    private armOff(): void {
        if (this.offArmed) {
            return;
        }
        this.offArmed = true;
        this.time.delayedCall(1600, () => this.powerOff());
    }

    private powerOff(): void {
        if (this.closing) {
            return;
        }
        this.closing = true;
        this.mode = 'off';
        stopMusic(this);
        this.cameras.main.fadeOut(420, 0, 0, 0);
        this.cameras.main.once(Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
            EventBus.emit('power-off');
        });
    }

    private drawRoom(): void {
        const graphics = this.add.graphics();
        graphics.fillStyle(0xcacaca, 1);
        graphics.fillRect(0, 0, 160, 80);
        graphics.fillStyle(0x666666, 1);
        graphics.fillRect(0, 80, 160, 64);

        graphics.fillStyle(0x1b1b1b, 1);
        graphics.fillRect(98, 14, 46, 34);
        graphics.fillStyle(0xbcbcbc, 1);
        graphics.fillRect(100, 16, 42, 30);
        graphics.fillStyle(0xf8f8f8, 0.45);
        graphics.fillRect(102, 18, 8, 26);

        graphics.fillStyle(0x474747, 1);
        graphics.fillRect(6, 72, 50, 14);
        graphics.fillStyle(0x989898, 1);
        graphics.fillRect(14, 68, 16, 8);
        graphics.fillStyle(0x181818, 1);
        graphics.fillRect(16, 70, 12, 4);
    }
}
