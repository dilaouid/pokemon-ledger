import { expect, it } from 'vitest';
import { BOSS_ID, victoryChance } from './battleRules';

it('keeps every starter and strategy favorable, with a harder boss', () => {
    for (let attack = 40; attack <= 80; attack++) {
        for (const strategy of [0, 1] as const) {
            for (let id = 0; id < BOSS_ID; id++) {
                const chance = victoryChance(attack, 120 - attack, id, strategy);
                expect(chance).toBeGreaterThanOrEqual(80);
                expect(chance).toBeLessThanOrEqual(95);
                expect(victoryChance(attack, 120 - attack, BOSS_ID, strategy)).toBeLessThan(chance);
            }
        }
        const best = attack >= 60 ? 0 : 1;
        expect(victoryChance(attack, 120 - attack, 0, best)).toBeGreaterThanOrEqual(90);
    }
});
