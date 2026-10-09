import type { Scene } from 'phaser';
import type { RunState } from '../types';
import type { GameController } from '../controllers/GameController';
import { STARTERS } from '../data/creatures';
import { TRAINER_IDS, BOSS_ID } from '../../domain/battleRules';

/** A projection of service state for existing scenes; never an authority. */
export function readRun(scene: Scene): RunState {
    const player = (scene.registry.get('gameController') as GameController | undefined)?.getSnapshot().player;
    if (!player) return { starterId: null, defeatedIds: [] };
    return {
        starterId: player.starterTokenId ? STARTERS[player.starter.speciesId].id : null,
        defeatedIds: TRAINER_IDS.filter((_, id) => id === BOSS_ID ? player.bossDefeated : (player.defeatedMask & (1 << id)) !== 0),
    };
}
