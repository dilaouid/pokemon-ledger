import { encodePacked, getAddress, keccak256, type Address } from 'viem';

export function deriveStarter(address: Address) {
    const seed = BigInt(keccak256(encodePacked(['string', 'address'], ['LEDGERMON_V1', getAddress(address)])));
    const attack = 40 + Number((seed >> 16n) % 41n);
    return { speciesId: Number(seed % 3n), attack, defense: 120 - attack };
}
