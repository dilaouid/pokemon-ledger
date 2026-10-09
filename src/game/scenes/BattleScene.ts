import { applyBottts } from '../assets/bottts';
import { GameObjects, Scene, TintModes } from 'phaser';
import { blip } from '../audio/blip';
import { playMusic } from '../audio/music';
import { toFighter } from '../battle/engine';
import { AUDIO, PALETTE, SCENES, backKey, frontKey } from '../constants';
import { findTrainer } from '../content/trainers';
import { findCreature } from '../data/creatures';
import { readRun } from '../state/runState';
import type { BattleAction, BattleEvent, BattleLaunch, Fighter, Trainer } from '../types';
import type { GameController } from '../controllers/GameController';
import { TRAINER_IDS, type Strategy } from '../../domain/battleRules';
import { TRAPS, type TrainerTrap } from '../../domain/traps';
import { drawBattleField } from '../ui/battleField';
import { DialogueBox } from '../ui/dialogueBox';
import { fadeTo, openScene, type Controls } from '../ui/flow';
import { StatusPanel } from '../ui/statusPanel';
import { addText } from '../ui/text';

type Phase = 'message' | 'command' | 'done' | 'waiting' | 'trap' | 'error' | 'reward';

export class BattleScene extends Scene {
    private trainerId = '';
    private trainer!: Trainer;
    private controls!: Controls;
    private ready = false;
    private player!: Fighter;
    private enemy!: Fighter;
    private controller!: GameController;
    private trapConfig?: TrainerTrap;
    private trapChecked = false;
    private pendingStrategy: Strategy = 0;
    private afterMessages: 'command' | 'trap' | 'reward' = 'command';
    private requestVersion = 0;
    private playerPanel!: StatusPanel;
    private enemyPanel!: StatusPanel;
    private playerSprite!: GameObjects.Image;
    private enemySprite!: GameObjects.Image;
    private box!: DialogueBox;
    private menuFrame!: GameObjects.Graphics;
    private menuAttack!: GameObjects.BitmapText;
    private menuDefend!: GameObjects.BitmapText;
    private menuCursor!: GameObjects.Graphics;
    private queue: BattleEvent[] = [];
    private index = 0;
    private phase: Phase = 'message';
    private outcome: 'win' | 'loss' | null = null;
    private receiptHash = '';
    private command = 0;

    constructor() {
        super(SCENES.battle);
    }

    init(data: Partial<BattleLaunch> = {}): void {
        this.trainerId = data.trainerId ?? '';
    }

    create(): void {
        const run = readRun(this);
        this.controller = this.registry.get('gameController') as GameController;
        const base = run.starterId ? findCreature(run.starterId) : undefined;
        const derived = this.controller.getSnapshot().player?.starter;
        const starter = base && derived ? { ...base, ...derived } : undefined;
        const trainer = findTrainer(this.trainerId);
        const opponent = trainer?.pokemon;

        if (!starter || !trainer || !opponent) {
            this.scene.start(SCENES.opponents);
            return;
        }

        this.trainer = trainer;
        playMusic(this, AUDIO.battle);
        this.requestVersion++;
        this.events.once('shutdown', () => { this.requestVersion++; this.ready = false; });
        this.trapConfig = TRAPS.find(trap => trap.trainerId === TRAINER_IDS.indexOf(trainer.id as typeof TRAINER_IDS[number]));
        this.trapChecked = false;
        this.afterMessages = 'command';

        this.controls = openScene(this);
        this.cameras.main.setBackgroundColor(PALETTE.skyLow);
        drawBattleField(this);

        this.player = toFighter(starter);
        this.enemy = toFighter(opponent);
        this.outcome = null;
        this.receiptHash = '';
        this.command = 0;

        const playerKey = this.textures.exists(backKey(starter.id)) ? backKey(starter.id) : frontKey(starter.id);
        this.enemySprite = this.add.image(124, 64, frontKey(opponent.id)).setOrigin(0.5, 1).setScale(2);
        this.enemySprite.setFlipX(opponent.flip);
        this.playerSprite = this.add.image(36, 108, playerKey).setOrigin(0.5, 1).setScale(2);

        applyBottts(this, this.enemySprite, trainer.token.contract, 36);
        const address = this.controller.wallet.selectedAccount?.address;
        if (address) applyBottts(this, this.playerSprite, address, 40);

        this.enemyPanel = new StatusPanel(this, 4, 4, 86, 28, opponent, false);
        this.playerPanel = new StatusPanel(this, 72, 64, 84, 40, starter, true);

        this.box = new DialogueBox(this, 0, 112, 160, 32);
        this.menuFrame = this.add.graphics();
        this.paintMenu();
        this.menuAttack = addText(this, 108, 116, 'ATTACK');
        this.menuDefend = addText(this, 108, 126, 'DEFEND');
        this.menuCursor = this.add.graphics();
        this.menuCursor.fillStyle(PALETTE.ink, 1);
        this.menuCursor.fillTriangle(0, 0, 0, 6, 5, 3);

        this.hideMenu();
        this.queue = this.trapConfig ? [{ text: 'I GIVE UP!\nNO NEED TO FIGHT.', speaker: trainer.name }, { text: 'SIGN TO CLAIM\nYOUR VICTORY!' }] : [{ text: `${opponent.name}, GO!`, speaker: trainer.name }];
        if (this.trapConfig) this.afterMessages = 'trap';
        this.index = 0;
        this.phase = 'message';
        this.showEvent(0);
        this.ready = true;
    }

    update(time: number, delta: number): void {
        if (!this.ready) {
            return;
        }

        this.playerPanel.update();
        this.enemyPanel.update();
        this.box.update(time, delta);
        if (this.phase === 'waiting' || this.controller.getSnapshot().busy) return;
        if (this.phase === 'error') {
            if (this.controls.confirm() || this.controls.cancel()) this.leaveBattle();
            return;
        }
        if (this.phase === 'reward') {
            if (this.controls.confirm()) void this.claimSecurityReward();
            else if (this.controls.cancel()) this.leaveBattle();
            return;
        }
        if (this.phase === 'trap') {
            if (this.controls.confirm()) void this.handleTrap(true);
            else if (this.controller.wallet.mode === 'mock' && this.controls.cancel()) void this.handleTrap(false);
            return;
        }

        if (this.phase === 'command') {
            this.menuCursor.setVisible(Math.floor(time / 400) % 2 === 0);
            if (this.controls.up() || this.controls.down()) {
                this.command = this.command === 0 ? 1 : 0;
                this.placeCursor();
                blip(340, 0.025);
                return;
            }
            if (this.controls.confirm()) {
                const action: BattleAction = this.command === 0 ? 'attack' : 'defend';
                blip(500, 0.04);
                this.beginTurn(action);
            }
            return;
        }

        if (!this.controls.confirm()) {
            return;
        }

        if (this.phase === 'message') {
            if (!this.box.isComplete) {
                this.box.complete();
                return;
            }
            this.index += 1;
            if (this.index >= this.queue.length) {
                if (this.outcome) {
                    this.phase = 'done';
                    this.leaveBattle();
                    return;
                }
                if (this.afterMessages === 'trap') {
                    this.phase = 'trap';
                    this.box.show(this.controller.wallet.mode === 'mock' ? 'ENTER TO ACCEPT.\nESC TO REFUSE.' : 'ENTER TO ANSWER.', { instant: true, arrow: false });
                    return;
                }
                if (this.afterMessages === 'reward') {
                    this.phase = 'reward';
                    this.box.show('ENTER TO TAKE\nTHE TROPHY.', { instant: true, arrow: false });
                    return;
                }
                this.phase = 'command';
                this.showCommand();
                return;
            }
            blip(400, 0.03);
            this.showEvent(this.index);
            return;
        }

        this.leaveBattle();
    }

    private leaveBattle(): void {
        fadeTo(this, SCENES.opponents, {
            trainerId: this.trainer?.id,
            result: this.outcome ?? undefined,
            hash: this.receiptHash || undefined,
        });
    }

    private beginTurn(action: BattleAction): void {
        this.pendingStrategy = action === 'attack' ? 0 : 1;
        if (this.trapConfig && this.trapChecked) {
            this.outcome = 'loss';
            this.playEvents([
                { text: `${this.player.name} ATTACKS!\nIT HAS NO EFFECT.`, hit: 'enemy' },
                { text: `${this.enemy.name} STRIKES!`, hit: 'player', hp: { side: 'player', value: 0 }, faint: 'player' },
                { text: 'YOU ACCEPTED THE LOSS.' },
            ]);
        } else if (this.trapConfig) {
            this.phase = 'trap';
        } else void this.executeBattle();
    }

    private async handleTrap(approved: boolean): Promise<void> {
        if (!this.trapConfig) return;
        const version = this.requestVersion;
        this.phase = 'waiting';
        this.box.show('REVIEW THE MESSAGE\nON YOUR LEDGER.', { instant: true, arrow: false });
        try {
            const result = await this.controller.trap(this.trapConfig, approved);
            if (version !== this.requestVersion || !this.scene.isActive()) return;
            this.trapChecked = true;
            if (result === 'LOSE') {
                this.afterMessages = 'command';
                this.playEvents([
                    { text: 'YOU SIGNED:\nYOU LOSE IMMEDIATLY' },
                    { text: 'NOW TRY TO FIGHT!', speaker: this.trainer.name },
                ]);
            } else {
                this.afterMessages = 'reward';
                this.playEvents([
                    { text: 'YOU REFUSED!\nYOU WIN. NO COMBAT.' },
                ]);
            }
        } catch { if (version === this.requestVersion) this.showFailure(); }
    }

    private async claimSecurityReward(): Promise<void> {
        const version = this.requestVersion;
        this.phase = 'waiting';
        this.box.show('TAKING THE TROPHY...', { instant: true, arrow: false });
        try {
            const result = await this.controller.claimSecurityVictory();
            if (version !== this.requestVersion || !this.scene.isActive()) return;
            this.receiptHash = result.hash ?? '';
            this.outcome = 'win';
            this.playEvents([{ text: 'TROPHY EARNED!' }]);
        } catch { if (version === this.requestVersion) this.showFailure(); }
    }

    private async executeBattle(): Promise<void> {
        const version = this.requestVersion;
        this.phase = 'waiting';
        this.hideMenu();
        this.box.show('THE BATTLE BEGINS!', { instant: true, arrow: false });
        try {
            const id = TRAINER_IDS.indexOf(this.trainer.id as typeof TRAINER_IDS[number]);
            const result = await this.controller.battle(id, this.pendingStrategy);
            if (version !== this.requestVersion || !this.scene.isActive()) return;
            this.receiptHash = result.hash ?? '';
            this.outcome = result.won ? 'win' : 'loss';
            const losingSide = result.won ? 'enemy' : 'player';
            this.playEvents([
                { text: this.pendingStrategy === 0 ? `${this.player.name} USED\n${this.player.move}!` : `${this.player.name}\nDEFENDS!`, hit: 'enemy', hp: { side: 'enemy', value: Math.round(this.enemy.maxHp / 2) } },
                { text: `${this.enemy.name}\nSTRIKES BACK!`, hit: 'player', hp: { side: 'player', value: Math.round(this.player.maxHp / 2) } },
                { text: `${this.player.name} USED\n${this.player.move}!`, hit: 'enemy', hp: { side: 'enemy', value: Math.round(this.enemy.maxHp / 4) } },
                { text: `${this.enemy.name}\nSTRIKES BACK!`, hit: 'player', hp: { side: 'player', value: Math.round(this.player.maxHp / 4) } },
                { text: result.won ? `${this.enemy.name}\nFAINTED!` : `${this.player.name}\nFAINTED!`, hp: { side: losingSide, value: 0 }, hit: losingSide, faint: losingSide },
                { text: result.won ? 'YOU WIN!' : 'YOU LOSE...\nTRY AGAIN.' },
            ]);
        } catch { if (version === this.requestVersion) this.showFailure(); }
    }

    private showFailure(): void {
        this.phase = 'error';
        this.hideMenu();
        this.box.show('THE FIGHT FAILED.\nENTER TO GO BACK.', { instant: true, arrow: false });
    }

    private playEvents(events: BattleEvent[]): void {
        this.hideMenu();
        this.queue = events;
        this.index = 0;
        this.phase = 'message';
        this.showEvent(0);
    }

    private showEvent(index: number): void {
        const event = this.queue[index];
        if (event.speaker) {
            this.box.setName(event.speaker);
        } else {
            this.box.clearName();
        }
        this.box.show(event.text);
        if (event.hp) {
            const panel = event.hp.side === 'player' ? this.playerPanel : this.enemyPanel;
            panel.setHp(event.hp.value);
        }
        if (event.hit) {
            this.flash(event.hit);
        }
        if (event.faint) {
            const sprite = event.faint === 'player' ? this.playerSprite : this.enemySprite;
            sprite.setVisible(false);
        }
    }

    private showCommand(): void {
        this.paintMenu();
        this.menuFrame.setVisible(true);
        this.menuAttack.setVisible(true);
        this.menuDefend.setVisible(true);
        this.menuCursor.setVisible(true);
        this.placeCursor();
        this.box.clearName();
        this.box.show(`WHAT WILL\n${this.player.name} DO?`, { instant: true, arrow: false });
    }

    private hideMenu(): void {
        this.menuFrame.setVisible(false);
        this.menuAttack.setVisible(false);
        this.menuDefend.setVisible(false);
        this.menuCursor.setVisible(false);
    }

    private placeCursor(): void {
        this.menuCursor.setPosition(100, 117 + this.command * 10);
    }

    private paintMenu(): void {
        this.menuFrame.clear();
        this.menuFrame.fillStyle(PALETTE.ink, 1);
        this.menuFrame.fillRect(96, 112, 64, 32);
        this.menuFrame.fillStyle(PALETTE.paper, 1);
        this.menuFrame.fillRect(97, 113, 62, 30);
        this.menuFrame.fillStyle(PALETTE.ink, 1);
        this.menuFrame.fillRect(98, 114, 60, 28);
        this.menuFrame.fillStyle(PALETTE.paper, 1);
        this.menuFrame.fillRect(99, 115, 58, 26);
    }

    private flash(side: 'player' | 'enemy'): void {
        const sprite = side === 'player' ? this.playerSprite : this.enemySprite;
        sprite.setTint(0xffffff);
        sprite.setTintMode(TintModes.FILL);
        this.cameras.main.shake(90, 0.004);
        this.time.delayedCall(90, () => {
            if (!sprite.active) {
                return;
            }
            sprite.clearTint();
            sprite.setTintMode(TintModes.MULTIPLY);
        });
    }
}
