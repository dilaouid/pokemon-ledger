import type { Address } from 'viem';
import { ALL_TRAINERS_MASK, BOSS_ID, TRAINER_IDS, victoryChance, type Strategy } from '../../domain/battleRules';
import { deriveStarter } from '../../domain/deriveStarter';
import { DIYAEDDINE_WARNING } from '../../domain/traps';
import type { WalletService } from '../wallet/WalletService';
import { ChainError, type BattleResult, type BlockchainService, type PlayerProgress, type Reward, type StatusListener } from './BlockchainService';

export class MockBlockchainService implements BlockchainService {
    readonly mode = 'mock';
    readonly contract = null;
    private players = new Map<string, PlayerProgress>();
    private tokens = new Map<string, Reward[]>();
    private nextId = 1n;
    constructor(private readonly wallet: WalletService, private readonly status: StatusListener = () => {}, private readonly random = Math.random) {}
    async readPlayer(address: Address): Promise<PlayerProgress> {
        const key = address.toLowerCase();
        const player = this.players.get(key) ?? { address, starterTokenId: 0n, defeatedMask: 0, bossDefeated: false, starter: deriveStarter(address) };
        this.players.set(key, player);
        return { ...player, starter: { ...player.starter } };
    }
    private address(): Address {
        if (!this.wallet.selectedAccount) throw new ChainError('ACCOUNT', 'Select an account.');
        return this.wallet.selectedAccount.address;
    }
    private async pause(): Promise<void> {
        this.status({ phase: 'pending', message: 'SIMULATED TRANSACTION' });
        await new Promise(resolve => setTimeout(resolve, 350));
    }
    private mint(address: Address, name: string): bigint {
        const tokenId = this.nextId++;
        const rewards = this.tokens.get(address.toLowerCase()) ?? [];
        rewards.push({ tokenId, name: `MOCK ${name}`, image: '', owner: address });
        this.tokens.set(address.toLowerCase(), rewards);
        return tokenId;
    }
    async claimStarter(): Promise<void> {
        const address = this.address();
        const p = await this.readPlayer(address);
        if (p.starterTokenId) throw new ChainError('ALREADY_CLAIMED', 'Starter already claimed.');
        await this.pause();
        p.starterTokenId = this.mint(address, ['LUMEN', 'GENERIC', 'MODULE'][p.starter.speciesId]);
        this.players.set(address.toLowerCase(), p);
        this.status({ phase: 'confirmed', message: 'SIMULATED STARTER' });
    }
    async battle(opponentId: number, strategy: Strategy): Promise<BattleResult> {
        if (opponentId === 2) throw new ChainError('SECURITY_CHALLENGE', 'Diyaeddine is a signing challenge.');
        const address = this.address();
        const p = await this.readPlayer(address);
        if (!p.starterTokenId) throw new ChainError('STARTER_REQUIRED', 'Claim your starter.');
        if (!Number.isInteger(opponentId) || opponentId < 0 || opponentId > BOSS_ID || (strategy !== 0 && strategy !== 1)) throw new ChainError('INVALID_BATTLE', 'Invalid battle.');
        if (opponentId === BOSS_ID ? p.bossDefeated : p.defeatedMask & (1 << opponentId)) throw new ChainError('ALREADY_DEFEATED', 'Trainer already beaten.');
        if (opponentId === BOSS_ID && p.defeatedMask !== ALL_TRAINERS_MASK) throw new ChainError('BOSS_LOCKED', 'Defeat all 13 trainers.');
        await this.pause();
        const won = this.random() * 100 < victoryChance(p.starter.attack, p.starter.defense, opponentId, strategy);
        if (won) {
            if (opponentId === BOSS_ID) p.bossDefeated = true;
            else p.defeatedMask |= 1 << opponentId;
            this.mint(address, opponentId === BOSS_ID ? 'PANORAMIX CHAMPION' : `${TRAINER_IDS[opponentId].toUpperCase()} TROPHY`);
            this.players.set(address.toLowerCase(), p);
        }
        this.status({ phase: 'confirmed', message: 'SIMULATED BATTLE' });
        return { won, opponentId };
    }
    async rewards(address: Address): Promise<Reward[]> { return [...this.tokens.get(address.toLowerCase()) ?? []]; }
    async claimSecurityVictory(warning: string): Promise<BattleResult> {
        const address = this.address();
        const p = await this.readPlayer(address);
        if (!p.starterTokenId) throw new ChainError('STARTER_REQUIRED', 'Claim your starter.');
        if (p.defeatedMask & (1 << 2)) throw new ChainError('ALREADY_DEFEATED', 'Trainer already beaten.');
        if (warning !== DIYAEDDINE_WARNING) throw new ChainError('INCORRECT_WARNING', 'Incorrect warning.');
        await this.pause();
        p.defeatedMask |= 1 << 2;
        this.players.set(address.toLowerCase(), p);
        this.mint(address, 'DIYAEDDINE TROPHY');
        this.status({ phase: 'confirmed', message: 'SIMULATED SECURITY REWARD' });
        return { won: true, opponentId: 2 };
    }
    async setTrainerImageBaseURI(): Promise<void> { throw new ChainError('MOCK', 'Image configuration is on-chain only.'); }
    async deploy(): Promise<Address> { throw new ChainError('MOCK', 'Mock mode needs no deployment.'); }
    async useContract(): Promise<void> { throw new ChainError('MOCK', 'Mock mode has no contract.'); }
    async recoverPending(): Promise<void> {}
}
