import { expect, it } from 'vitest';
import { getAddress, type Address } from 'viem';
import { deriveStarter } from './deriveStarter';

it('derives three balanced species deterministically across addresses', () => {
    const species = new Set<number>();
    for (let i = 1; i <= 200; i++) {
        const address = `0x${i.toString(16).padStart(40, '0')}` as Address;
        const starter = deriveStarter(address);
        expect(starter).toEqual(deriveStarter(getAddress(address)));
        expect(starter.attack).toBeGreaterThanOrEqual(40);
        expect(starter.attack).toBeLessThanOrEqual(80);
        expect(starter.defense).toBeGreaterThanOrEqual(40);
        expect(starter.defense).toBeLessThanOrEqual(80);
        expect(starter.attack + starter.defense).toBe(120);
        species.add(starter.speciesId);
    }
    expect([...species].sort()).toEqual([0, 1, 2]);
});
