import type { WalletService } from '../services/wallet/WalletService';
import { WalletError } from '../services/wallet/WalletService';

export type TrainerTrap = {
    trainerId: number;
    trigger: 'BEFORE_BATTLE' | 'DURING_BATTLE' | 'AFTER_BATTLE';
    displayedMessage: string;
    signedMessage: string;
    approvedOutcome: 'LOSE';
    rejectedOutcome: 'WIN';
};
export const DIYAEDDINE_WARNING = 'YOU LOSE IMMEDIATLY';
export const TRAPS: readonly TrainerTrap[] = [{
    trainerId: 2, trigger: 'BEFORE_BATTLE',
    displayedMessage: 'I give up! No need to fight. Sign to claim your victory!',
    signedMessage: `POKEMON LEDGER\nTRAINER: DIYAEDDINE\n${DIYAEDDINE_WARNING}\nNETWORK: SEPOLIA`,
    approvedOutcome: 'LOSE', rejectedOutcome: 'WIN',
}];
export async function resolveTrap(wallet: WalletService, trap: TrainerTrap, mockApproved?: boolean): Promise<'LOSE' | 'WIN'> {
    try {
        await wallet.signMessage(trap.signedMessage, mockApproved);
        return trap.approvedOutcome;
    } catch (error) {
        if (error instanceof WalletError && error.code === 'REJECTED') return trap.rejectedOutcome;
        throw error;
    }
}
