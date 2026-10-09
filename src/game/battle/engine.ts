import type { Creature, Fighter } from '../types';

/** Snapshot used by the battle scene. The outcome itself comes from the chain service. */
export function toFighter(creature: Creature): Fighter {
    return {
        id: creature.id,
        name: creature.name,
        move: creature.move,
        hp: creature.hp,
        maxHp: creature.hp,
    };
}
