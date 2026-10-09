import { getAddress, type Address } from 'viem';
import type { BlockchainService, PlayerProgress, Reward, TransactionStatus } from '../../services/blockchain/BlockchainService';
import { ChainError } from '../../services/blockchain/BlockchainService';
import type { WalletService } from '../../services/wallet/WalletService';
import { WalletError } from '../../services/wallet/WalletService';
import type { Strategy } from '../../domain/battleRules';
import { resolveTrap, type TrainerTrap } from '../../domain/traps';
import { DIYAEDDINE_WARNING } from '../../domain/traps';

export interface GameSnapshot {
    player: PlayerProgress | null;
    rewards: Reward[];
    busy: boolean;
    error: string | null;
    transaction: TransactionStatus;
    contract: Address | null;
    needsDeployment: boolean;
    messageRequest: { text: string; state: 'pending' | 'approved' | 'rejected' | 'error' } | null;
}

export class GameController {
    private snapshot: GameSnapshot;
    private listeners = new Set<() => void>();
    constructor(readonly wallet: WalletService, readonly blockchain: BlockchainService) {
        this.snapshot = { player: null, rewards: [], busy: false, error: null, transaction: { phase: 'idle', message: wallet.mode === 'mock' ? 'MOCK MODE' : 'SEPOLIA' }, contract: blockchain.contract, needsDeployment: false, messageRequest: null };
    }
    getSnapshot = (): GameSnapshot => this.snapshot;
    subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    private update(update: Partial<GameSnapshot>): void {
        this.snapshot = { ...this.snapshot, ...update };
        this.listeners.forEach(listener => listener());
    }
    onStatus = (transaction: TransactionStatus): void => { this.update({ transaction }); };
    private async run<T>(action: () => Promise<T>): Promise<T> {
        if (this.snapshot.busy) throw new ChainError('BUSY', 'Request already pending.');
        this.update({ busy: true, error: null });
        try { return await action(); }
        catch (error) {
            const message = error instanceof ChainError || error instanceof WalletError ? error.message : 'Network request failed. Retry refresh.';
            this.update({ error: message });
            throw error;
        } finally { this.update({ busy: false }); }
    }
    private async refreshState(): Promise<void> {
        const account = this.wallet.selectedAccount;
        if (!account) throw new ChainError('ACCOUNT', 'Select an account.');
        if (this.blockchain.mode === 'sepolia' && !this.blockchain.contract) {
            this.update({ needsDeployment: true, player: null, rewards: [], contract: null });
            return;
        }
        const player = await this.blockchain.readPlayer(account.address);
        // Progress is authoritative even if optional NFT metadata cannot be loaded.
        this.update({ player, needsDeployment: false, contract: this.blockchain.contract });
        try { this.update({ rewards: await this.blockchain.rewards(account.address) }); }
        catch { this.update({ rewards: [], error: 'Progress loaded. NFT metadata unavailable.' }); }
    }
    initialize(): Promise<void> { return this.run(async () => { await this.blockchain.recoverPending(); await this.refreshState(); }); }
    claimStarter(): Promise<void> { return this.run(async () => {
        try { await this.blockchain.claimStarter(); } finally { await this.refreshState(); }
    }); }
    battle(id: number, strategy: Strategy) { return this.run(async () => {
        try { return await this.blockchain.battle(id, strategy); } finally { await this.refreshState(); }
    }); }
    deploy(): Promise<void> { return this.run(async () => { await this.blockchain.deploy(); await this.refreshState(); }); }
    claimSecurityVictory() { return this.run(async () => {
        try { return await this.blockchain.claimSecurityVictory(DIYAEDDINE_WARNING); } finally { await this.refreshState(); }
    }); }
    setTrainerImages(baseURI: string): Promise<void> { return this.run(async () => { await this.blockchain.setTrainerImageBaseURI(baseURI); await this.refreshState(); }); }
    useContract(address: string): Promise<void> { return this.run(async () => { await this.blockchain.useContract(getAddress(address)); await this.refreshState(); }); }
    testTrapRendering(trap: TrainerTrap): Promise<void> { return this.run(async () => {
        await this.requestTrapMessage(trap);
    }); }
    trap(trap: TrainerTrap, mockApproved?: boolean) { return this.run(async () => {
        return this.requestTrapMessage(trap, mockApproved);
    }); }
    private async requestTrapMessage(trap: TrainerTrap, mockApproved?: boolean) {
        this.update({ messageRequest: { text: trap.signedMessage, state: 'pending' } });
        try {
            const result = await resolveTrap(this.wallet, trap, mockApproved);
            this.update({ messageRequest: { text: trap.signedMessage, state: result === 'WIN' ? 'rejected' : 'approved' } });
            return result;
        } catch (error) {
            this.update({ messageRequest: { text: trap.signedMessage, state: 'error' } });
            throw error;
        }
    }
}

// React attaches after Phaser construction; retain the current controller for it.
let activeController: GameController | null = null;
const controllerListeners = new Set<() => void>();
export const getActiveController = () => activeController;
export function subscribeController(listener: () => void) { controllerListeners.add(listener); return () => { controllerListeners.delete(listener); }; }
export function setActiveController(controller: GameController | null) { activeController = controller; controllerListeners.forEach(listener => listener()); }
