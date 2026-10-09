import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { GameController, getActiveController, subscribeController } from './game/controllers/GameController';
import { EventBus } from './game/EventBus';

const BLOCKSCOUT_ADDRESS = 'https://eth-sepolia.blockscout.com/address';

export function WalletPanel() {
    const controller = useSyncExternalStore(subscribeController, getActiveController);
    return controller ? <ConnectedPanel controller={controller} /> : null;
}

function ConnectedPanel({ controller }: { controller: GameController }) {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    const [expanded, setExpanded] = useState(false);
    const [contract, setContract] = useState('');
    const account = controller.wallet.selectedAccount;
    const prompt = [state.needsDeployment ? 'deploy' : '', state.error ?? ''].filter(Boolean).join('|');
    const openedFor = useRef('');
    useEffect(() => {
        if (!prompt || openedFor.current === prompt) return;
        openedFor.current = prompt;
        setExpanded(true);
    }, [prompt]);
    const run = (action: () => Promise<unknown>) => { void action().catch(() => {}); };
    const releaseGameKeys = (event: MouseEvent<HTMLElement>) => {
        const target = event.target;
        if (!(target instanceof Element) || target.closest('input:not([type=checkbox]), textarea')) return;
        const active = document.activeElement;
        if (active instanceof HTMLElement && event.currentTarget.contains(active)) active.blur();
    };
    return <aside className={expanded ? 'wallet-panel is-open' : 'wallet-panel'} aria-label="Wallet and rewards"
        onClick={releaseGameKeys}
        onFocus={() => EventBus.emit('wallet-panel-focus', true)}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) EventBus.emit('wallet-panel-focus', false); }}>
        <button className="wallet-toggle" type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>
            {expanded ? '▾' : '▸'} WALLET
        </button>
        {expanded && <div className="wallet-content">
            {account ? <code>{account.address}</code> : <p>Choose your account during Anthony's dialogue.</p>}
            {account && <a href={`${BLOCKSCOUT_ADDRESS}/${account.address}`} target="_blank" rel="noreferrer">Player on Blockscout</a>}
            {state.contract && <a href={`${BLOCKSCOUT_ADDRESS}/${state.contract}`} target="_blank" rel="noreferrer">Smart contract</a>}
            {state.error && <p role="alert" className="wallet-error">{state.error}</p>}
            {state.needsDeployment && <section>
                <p>Direct contract creation, with no factory. Only the deployer account signs. Fees are paid in test ETH.</p>
                <button disabled={state.busy || !account} onClick={() => run(() => controller.deploy())}>Deploy with Ledger</button>
                <form onSubmit={event => { event.preventDefault(); run(() => controller.useContract(contract)); }}>
                    <label>Or use an existing contract<input value={contract} onChange={event => setContract(event.target.value)} placeholder="0x…" spellCheck={false} /></label>
                    <button disabled={state.busy || !account || !contract}>Load contract</button>
                </form>
            </section>}
        </div>}
    </aside>;
}
