import { AUTO, Game, Scale, type Types } from 'phaser';
import { SCREEN } from './constants';
import { BattleScene } from './scenes/BattleScene';
import { BootScene } from './scenes/BootScene';
import { IntroScene } from './scenes/IntroScene';
import { OpponentsScene } from './scenes/OpponentsScene';
import { StarterScene } from './scenes/StarterScene';
import { TitleScene } from './scenes/TitleScene';
import { createWalletService } from '../services/wallet/createWalletService';
import type { WalletService } from '../services/wallet/WalletService';
import { GameController, getActiveController, setActiveController } from './controllers/GameController';
import { MockBlockchainService } from '../services/blockchain/MockBlockchainService';
import { SepoliaBlockchainService } from '../services/blockchain/SepoliaBlockchainService';
import { EventBus } from './EventBus';

const config: Types.Core.GameConfig = {
    type: AUTO,
    width: SCREEN.width,
    height: SCREEN.height,
    parent: 'game-container',
    backgroundColor: '#10121a',
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH,
        width: SCREEN.width,
        height: SCREEN.height,
    },
    scene: [
        BootScene,
        TitleScene,
        IntroScene,
        StarterScene,
        OpponentsScene,
        BattleScene,
    ],
    input: {
        keyboard: true,
    },
};

const StartGame = (parent: string, wallet: WalletService = createWalletService()) => {
    const blockchain = wallet.mode === 'mock'
        ? new MockBlockchainService(wallet, status => controller.onStatus(status))
        : new SepoliaBlockchainService(wallet, status => controller.onStatus(status));
    const controller = new GameController(wallet, blockchain);
    setActiveController(controller);
    const game = new Game({ ...config, parent, callbacks: {
        preBoot: game => { game.registry.set('walletService', wallet); game.registry.set('gameController', controller); },
    } });
    const panelFocus = (focused: boolean) => { if (game.input.keyboard) game.input.keyboard.enabled = !focused; };
    // Canvas mousedown calls preventDefault, so a click on the game cannot blur the panel.
    // Release that focus on pointerdown, which runs first, and hand the keys back.
    const returnToGame = () => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || !active.closest('.wallet-panel')) return;
        active.blur();
        game.canvas.focus({ preventScroll: true });
        if (game.input.keyboard) game.input.keyboard.enabled = true;
    };
    game.canvas.tabIndex = 0;
    game.canvas.addEventListener('pointerdown', returnToGame);
    EventBus.on('wallet-panel-focus', panelFocus);
    // Destroy runs on a later frame. A replaced game must not clear the controller React is showing.
    game.events.once('destroy', () => {
        wallet.dispose();
        if (getActiveController() === controller) setActiveController(null);
        game.canvas.removeEventListener('pointerdown', returnToGame);
        EventBus.off('wallet-panel-focus', panelFocus);
    });
    return game;
};

export default StartGame;
