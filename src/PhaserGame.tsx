import { useLayoutEffect, useRef } from 'react';
import StartGame from './game/main';

export function PhaserGame() {
    const game = useRef<Phaser.Game | null>(null);

    useLayoutEffect(() => {
        game.current = StartGame('game-container');
        return () => {
            game.current?.destroy(true);
            game.current = null;
        };
    }, []);

    return <div id="game-container" />;
}
