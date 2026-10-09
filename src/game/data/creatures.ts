import type { Creature } from '../types';

/** Partners the player can still pick. Opponents live in content/trainers. */
export const CREATURES: readonly Creature[] = [
    {
        id: 'voltik',
        name: 'LUMEN',
        kind: 'starter',
        template: 'beast',
        level: 5,
        hp: 52,
        attack: 66,
        defense: 44,
        move: 'SPARK',
        blurb: 'A LIGHT IN THE WALLET.',
        flip: false,
        outline: '#302010',
        body: '#f8e038',
        shade: '#e09820',
        accent: '#f84840',
    },
    {
        id: 'bunkle',
        name: 'GENERIC',
        kind: 'starter',
        template: 'armor',
        level: 5,
        hp: 68,
        attack: 48,
        defense: 74,
        move: 'SHELL',
        blurb: 'IT ADAPTS WELL.',
        flip: false,
        outline: '#183018',
        body: '#68b050',
        shade: '#387038',
        accent: '#d0d8e0',
    },
    {
        id: 'flaren',
        name: 'MODULE',
        kind: 'starter',
        template: 'beast',
        level: 5,
        hp: 54,
        attack: 72,
        defense: 42,
        move: 'EMBER',
        blurb: 'PLUGS INTO THE COINS.',
        flip: false,
        outline: '#401808',
        body: '#f87830',
        shade: '#c04018',
        accent: '#f8d030',
    },
];

export const STARTERS: readonly Creature[] = CREATURES.filter((creature) => creature.kind === 'starter');

export function findCreature(id: string): Creature | undefined {
    return CREATURES.find((creature) => creature.id === id);
}
