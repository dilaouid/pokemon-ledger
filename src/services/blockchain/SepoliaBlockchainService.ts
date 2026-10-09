import { createPublicClient, decodeFunctionData, encodeFunctionData, getAddress, getContractAddress, http, keccak256, parseEventLogs, parseTransaction, recoverTransactionAddress, stringToHex, type Address, type Hex, type TransactionReceipt, type TransactionSerialized } from 'viem';
import { sepolia } from 'viem/chains';
import { ledgerMonAbi } from '../../contracts/abi';
import { ALL_TRAINERS_MASK, BOSS_ID, type Strategy } from '../../domain/battleRules';
import { deriveStarter } from '../../domain/deriveStarter';
import { SEPOLIA_CHAIN_ID, type WalletService } from '../wallet/WalletService';
import { ChainError, type BattleResult, type BlockchainService, type PlayerProgress, type Reward, type StatusListener } from './BlockchainService';

const VERSION = keccak256(stringToHex('LEDGERMON_V3_FRIENDLY_BATTLES'));
const CONTRACT_CACHE = 'ledgermon:sepolia:contract:v2:portraits';
// Direct CREATE from this account. A factory call is opaque on the device.
const DEFAULT_DEPLOYER: Address = '0x823Ab8a0dB1c87Ee62042495db9bae1c8e2D30dB';
interface Pending { hash: Hex; raw: Hex; account: Address; contract: Address | null; kind: 'deploy' | 'claim' | 'battle' | 'security-reward' | 'images' }

export class SepoliaBlockchainService implements BlockchainService {
    readonly mode = 'sepolia';
    contract: Address | null;
    private readonly client;
    private busy = false;
    constructor(private readonly wallet: WalletService, private readonly status: StatusListener = () => {}) {
        this.client = createPublicClient({ chain: sepolia, transport: http(import.meta.env.VITE_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com', { timeout: 20_000, retryCount: 1 }) });
        const configured = import.meta.env.VITE_LEDGERMON_ADDRESS || localStorage.getItem(CONTRACT_CACHE);
        this.contract = configured ? getAddress(configured) : null;
    }
    private address(): Address {
        if (!this.wallet.selectedAccount) throw new ChainError('ACCOUNT', 'Select an account.');
        return this.wallet.selectedAccount.address;
    }
    private pendingKey(): string { return `ledgermon:pending:${SEPOLIA_CHAIN_ID}:${this.address().toLowerCase()}`; }
    private async network(): Promise<void> {
        if (await this.client.getChainId() !== SEPOLIA_CHAIN_ID) throw new ChainError('WRONG_NETWORK', 'RPC must be Sepolia.');
    }
    private target(): Address {
        if (!this.contract) throw new ChainError('DEPLOYMENT_REQUIRED', 'Deploy or select a contract.');
        return this.contract;
    }
    private async validateContract(address: Address): Promise<void> {
        await this.network();
        if (await this.client.readContract({ address, abi: ledgerMonAbi, functionName: 'GAME_VERSION' }) !== VERSION) throw new ChainError('WRONG_CONTRACT', 'This update needs a new LedgerMon V3 deployment.');
    }
    async useContract(address: Address): Promise<void> {
        if (this.busy || localStorage.getItem(this.pendingKey())) throw new ChainError('PENDING', 'Resolve pending transaction first.');
        const checked = getAddress(address);
        await this.validateContract(checked);
        this.contract = checked;
        localStorage.setItem(CONTRACT_CACHE, checked);
    }
    async readPlayer(address: Address): Promise<PlayerProgress> {
        const target = this.target();
        await this.validateContract(target);
        const [state, starter] = await Promise.all([
            this.client.readContract({ address: target, abi: ledgerMonAbi, functionName: 'getPlayer', args: [address] }),
            this.client.readContract({ address: target, abi: ledgerMonAbi, functionName: 'deriveStarter', args: [address] }),
        ]);
        const expected = deriveStarter(address);
        if (starter[0] !== expected.speciesId || starter[1] !== expected.attack || starter[2] !== expected.defense) throw new ChainError('PARITY', 'Starter mismatch.');
        return { address, starterTokenId: state[0], defeatedMask: state[1], bossDefeated: state[2], starter: expected };
    }
    async claimStarter(): Promise<void> {
        const state = await this.readPlayer(this.address());
        if (state.starterTokenId) throw new ChainError('ALREADY_CLAIMED', 'Starter already claimed.');
        await this.transact('claim', encodeFunctionData({ abi: ledgerMonAbi, functionName: 'claimStarter' }), this.target());
    }
    async battle(opponentId: number, strategy: Strategy): Promise<BattleResult> {
        if (opponentId === 2) throw new ChainError('SECURITY_CHALLENGE', 'Diyaeddine is a signing challenge.');
        if (!Number.isInteger(opponentId) || opponentId < 0 || opponentId > BOSS_ID || (strategy !== 0 && strategy !== 1)) throw new ChainError('INVALID_BATTLE', 'Invalid battle.');
        const state = await this.readPlayer(this.address());
        if (!state.starterTokenId) throw new ChainError('STARTER_REQUIRED', 'Claim your starter.');
        if (opponentId === BOSS_ID ? state.bossDefeated : state.defeatedMask & (1 << opponentId)) throw new ChainError('ALREADY_DEFEATED', 'Trainer already beaten.');
        if (opponentId === BOSS_ID && state.defeatedMask !== ALL_TRAINERS_MASK) throw new ChainError('BOSS_LOCKED', 'Defeat all 13 trainers.');
        const receipt = await this.transact('battle', encodeFunctionData({ abi: ledgerMonAbi, functionName: 'battle', args: [opponentId, strategy] }), this.target());
        const event = parseEventLogs({ abi: ledgerMonAbi, logs: receipt.logs, eventName: 'BattleResolved' }).find(log =>
            log.address.toLowerCase() === this.target().toLowerCase() && log.args.player.toLowerCase() === state.address.toLowerCase() && log.args.opponentId === opponentId && log.args.strategy === strategy);
        if (!event) throw new ChainError('EVENT', 'Battle event missing. Refresh.');
        return { won: event.args.won, opponentId, hash: receipt.transactionHash };
    }
    async claimSecurityVictory(warning: string): Promise<BattleResult> {
        await this.validateContract(this.target());
        const receipt = await this.transact('security-reward', encodeFunctionData({ abi: ledgerMonAbi, functionName: 'claimDiyaeddineReward', args: [warning] }), this.target());
        const event = parseEventLogs({ abi: ledgerMonAbi, logs: receipt.logs, eventName: 'TrophyMinted' }).find(log =>
            log.address.toLowerCase() === this.target().toLowerCase() && log.args.player.toLowerCase() === this.address().toLowerCase() && log.args.opponentId === 2);
        if (!event) throw new ChainError('EVENT', 'Reward event missing. Refresh.');
        return { won: true, opponentId: 2, hash: receipt.transactionHash };
    }
    async setTrainerImageBaseURI(baseURI: string): Promise<void> {
        if (!/^(https:\/\/|ipfs:\/\/)[^\s"\\]+\/$/.test(baseURI)) throw new ChainError('IMAGE_URI', 'Use an HTTPS or IPFS directory ending with /.');
        const target = this.target();
        await this.validateContract(target);
        const admin = await this.client.readContract({ address: target, abi: ledgerMonAbi, functionName: 'metadataAdmin' });
        if (admin.toLowerCase() !== this.address().toLowerCase()) throw new ChainError('ADMIN', 'Only the contract deployer can set portraits.');
        await this.transact('images', encodeFunctionData({ abi: ledgerMonAbi, functionName: 'setTrainerImageBaseURI', args: [baseURI] }), target);
    }
    private deployer(): Address {
        return getAddress(import.meta.env.VITE_DEPLOYER_ADDRESS || DEFAULT_DEPLOYER);
    }
    private async bytecode(): Promise<Hex> {
        const { ledgerMonBytecode } = await import('../../contracts/bytecode');
        return ledgerMonBytecode;
    }
    private async findDeployed(): Promise<Address | null> {
        await this.network();
        const from = this.deployer();
        const nonce = await this.client.getTransactionCount({ address: from });
        for (let i = nonce - 1; i >= Math.max(0, nonce - 40); i--) {
            const address = getContractAddress({ from, nonce: BigInt(i) });
            const code = await this.client.getCode({ address });
            if (!code || code === '0x') continue;
            try {
                await this.validateContract(address);
                return address;
            } catch (error) {
                if (error instanceof ChainError && error.code === 'WRONG_NETWORK') throw error;
            }
        }
        return null;
    }
    private remember(address: Address): Address {
        this.contract = address;
        localStorage.setItem(CONTRACT_CACHE, address);
        return address;
    }
    async deploy(): Promise<Address> {
        if (this.contract) throw new ChainError('DEPLOYED', 'A contract is already selected.');
        const existing = await this.findDeployed();
        if (existing) return this.remember(existing);
        if (getAddress(this.address()) !== this.deployer()) throw new ChainError('DEPLOYMENT', 'Contract not deployed yet.');
        await this.transact('deploy', await this.bytecode());
        if (!this.contract) throw new ChainError('DEPLOYMENT', 'Deployment address missing.');
        return this.contract;
    }
    private async transact(kind: Pending['kind'], data: Hex, to?: Address): Promise<TransactionReceipt> {
        if (this.busy || localStorage.getItem(this.pendingKey())) throw new ChainError('PENDING', 'Resolve pending transaction first.');
        this.busy = true;
        try {
            await this.network();
            const account = this.address();
            const [estimatedGas, fees, nonce, balance] = await Promise.all([
                this.client.estimateGas({ account, to, data, value: 0n }),
                this.client.estimateFeesPerGas(),
                this.client.getTransactionCount({ address: account, blockTag: 'pending' }),
                this.client.getBalance({ address: account }),
            ]);
            const gas = estimatedGas * 120n / 100n;
            if (balance < gas * fees.maxFeePerGas) throw new ChainError('FUNDS', 'Insufficient Sepolia ETH.');
            this.status({ phase: 'signing', message: 'CONFIRM ON YOUR LEDGER' });
            const raw = await this.wallet.signTransaction({ chainId: SEPOLIA_CHAIN_ID, to, data, value: 0n, gas, nonce, ...fees });
            const pending: Pending = { hash: keccak256(raw), raw, account, contract: to ?? null, kind };
            // Public signed transaction cache only. Persist BEFORE broadcast so closing
            // the application cannot lose a pending transaction. Never cache progress.
            localStorage.setItem(this.pendingKey(), JSON.stringify(pending));
            return await this.settle(pending);
        } finally { this.busy = false; }
    }
    private async validatePending(p: Pending): Promise<void> {
        if (!['deploy', 'claim', 'battle', 'security-reward', 'images'].includes(p.kind)) throw new ChainError('CACHE', 'Invalid pending action.');
        if (p.account.toLowerCase() !== this.address().toLowerCase() || keccak256(p.raw) !== p.hash) throw new ChainError('CACHE', 'Invalid pending transaction.');
        const tx = parseTransaction(p.raw);
        if (tx.chainId !== SEPOLIA_CHAIN_ID || (tx.value ?? 0n) !== 0n || getAddress(await recoverTransactionAddress({ serializedTransaction: p.raw as TransactionSerialized })) !== getAddress(p.account)) throw new ChainError('CACHE', 'Invalid pending signature.');
        if (p.kind === 'deploy') {
            if (tx.to || getAddress(p.account) !== this.deployer() || tx.data !== await this.bytecode()) throw new ChainError('CACHE', 'Invalid deployment cache.');
        } else {
            if (!p.contract || tx.to?.toLowerCase() !== p.contract.toLowerCase() || (this.contract && this.contract.toLowerCase() !== p.contract.toLowerCase())) throw new ChainError('CACHE', 'Pending contract mismatch.');
            await this.validateContract(p.contract);
            const decoded = decodeFunctionData({ abi: ledgerMonAbi, data: tx.data ?? '0x' });
            const allowed = { claim: 'claimStarter', battle: 'battle', 'security-reward': 'claimDiyaeddineReward', images: 'setTrainerImageBaseURI' };
            if (decoded.functionName !== allowed[p.kind]) throw new ChainError('CACHE', 'Invalid pending action.');
        }
    }
    private async settle(pending: Pending): Promise<TransactionReceipt> {
        await this.network();
        await this.validatePending(pending);
        this.status({ phase: 'pending', message: 'WAITING FOR SEPOLIA', hash: pending.hash });
        // Rebroadcasting identical signed bytes is idempotent, including after reload.
        try { await this.client.sendRawTransaction({ serializedTransaction: pending.raw }); } catch { /* May already be mined/known. Receipt is authoritative. */ }
        let receipt: TransactionReceipt;
        try { receipt = await this.client.waitForTransactionReceipt({ hash: pending.hash, timeout: 120_000 }); }
        catch { throw new ChainError('PENDING', 'Still pending. Use Resume.'); }
        if (receipt.transactionHash.toLowerCase() !== pending.hash.toLowerCase()) {
            localStorage.removeItem(this.pendingKey());
            this.status({ phase: 'error', message: 'TRANSACTION REPLACED. REFRESH.', hash: receipt.transactionHash });
            throw new ChainError('REPLACED', 'Transaction replaced. Refresh progress.');
        }
        if (receipt.status !== 'success') {
            localStorage.removeItem(this.pendingKey());
            throw new ChainError('REVERTED', 'Transaction reverted.');
        }
        if (pending.kind === 'deploy') {
            const tx = parseTransaction(pending.raw);
            if (tx.nonce === undefined) throw new ChainError('CACHE', 'Invalid deployment cache.');
            const address = getContractAddress({ from: getAddress(pending.account), nonce: BigInt(tx.nonce) });
            await this.validateContract(address);
            this.remember(address);
        }
        localStorage.removeItem(this.pendingKey());
        this.status({ phase: 'confirmed', message: 'CONFIRMED ON SEPOLIA', hash: receipt.transactionHash });
        return receipt;
    }
    async recoverPending(): Promise<void> {
        if (this.busy) throw new ChainError('PENDING', 'Transaction already pending.');
        const saved = localStorage.getItem(this.pendingKey());
        if (!saved) return;
        this.busy = true;
        try {
            const pending = JSON.parse(saved) as Pending;
            await this.settle(pending);
        } finally { this.busy = false; }
    }
    async rewards(address: Address): Promise<Reward[]> {
        const target = this.target();
        const p = await this.readPlayer(address);
        const ids = await Promise.all(Array.from({ length: BOSS_ID + 1 }, (_, id) => this.client.readContract({ address: target, abi: ledgerMonAbi, functionName: 'trophyOf', args: [address, id] })));
        return Promise.all([p.starterTokenId, ...ids].filter(id => id !== 0n).map(async tokenId => {
            const [uri, owner] = await Promise.all([
                this.client.readContract({ address: target, abi: ledgerMonAbi, functionName: 'tokenURI', args: [tokenId] }),
                this.client.readContract({ address: target, abi: ledgerMonAbi, functionName: 'ownerOf', args: [tokenId] }),
            ]);
            const metadata = JSON.parse(atob(uri.slice('data:application/json;base64,'.length))) as { name: string; image: string };
            return { tokenId, name: metadata.name, image: metadata.image, owner, url: `https://sepolia.etherscan.io/token/${target}?a=${tokenId}` };
        }));
    }
}
