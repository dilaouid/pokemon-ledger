import type { Address, Hex } from 'viem';
import type { Strategy } from '../../domain/battleRules';
import type { deriveStarter } from '../../domain/deriveStarter';

export interface PlayerProgress {
    address: Address;
    starterTokenId: bigint;
    defeatedMask: number;
    bossDefeated: boolean;
    starter: ReturnType<typeof deriveStarter>;
}
export interface BattleResult { won: boolean; opponentId: number; hash?: Hex }
export interface Reward { tokenId: bigint; name: string; image: string; owner: Address; url?: string }
export interface TransactionStatus {
    phase: 'idle' | 'signing' | 'pending' | 'confirmed' | 'error';
    message: string;
    hash?: Hex;
}
export type StatusListener = (status: TransactionStatus) => void;
export interface BlockchainService {
    readonly mode: 'mock' | 'sepolia';
    readonly contract: Address | null;
    readPlayer(address: Address): Promise<PlayerProgress>;
    claimStarter(): Promise<void>;
    battle(opponentId: number, strategy: Strategy): Promise<BattleResult>;
    claimSecurityVictory(warning: string): Promise<BattleResult>;
    setTrainerImageBaseURI(baseURI: string): Promise<void>;
    rewards(address: Address): Promise<Reward[]>;
    deploy(): Promise<Address>;
    useContract(address: Address): Promise<void>;
    recoverPending(): Promise<void>;
}

export class ChainError extends Error {
    constructor(public readonly code: string, message: string) { super(message); this.name = 'ChainError'; }
}
