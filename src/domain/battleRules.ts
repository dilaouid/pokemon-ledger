export const REGULAR_TRAINERS = 13;
export const BOSS_ID = 13;
export const ALL_TRAINERS_MASK = (1 << REGULAR_TRAINERS) - 1;
export const TRAINER_IDS = ['teddy', 'benoit', 'diyaeddine', 'stephane', 'henri', 'livio', 'moustafa', 'oscar', 'francois', 'quentin', 'piotr', 'hedi', 'tristan', 'panoramix'] as const;
export type Strategy = 0 | 1;
export function victoryChance(attack: number, defense: number, opponentId: number, strategy: Strategy): number {
    return Math.max(opponentId === BOSS_ID ? 70 : 80, Math.min(opponentId === BOSS_ID ? 85 : 95, 60 + Math.floor((strategy === 0 ? attack : defense) / 2) - (opponentId === BOSS_ID ? 10 : opponentId % 4)));
}
