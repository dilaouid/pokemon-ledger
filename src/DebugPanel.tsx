import { useState, type MouseEvent } from 'react';
import { isMusicEnabled, setMusicEnabled } from './game/audio/music';
import { EventBus } from './game/EventBus';

export function DebugPanel() {
    const [expanded, setExpanded] = useState(false);
    const [music, setMusic] = useState(isMusicEnabled);
    const releaseGameKeys = (event: MouseEvent<HTMLElement>) => {
        const target = event.target;
        if (!(target instanceof Element) || target.closest('input:not([type=checkbox]), textarea')) return;
        const active = document.activeElement;
        if (active instanceof HTMLElement && event.currentTarget.contains(active)) active.blur();
    };
    return <aside className={expanded ? 'debug-panel is-open' : 'debug-panel'} aria-label="Debug"
        onClick={releaseGameKeys}
        onFocus={() => EventBus.emit('wallet-panel-focus', true)}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) EventBus.emit('wallet-panel-focus', false); }}>
        <button className="debug-toggle" type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>
            {expanded ? '▾' : '▸'} DEBUG
        </button>
        {expanded && <label>
            <input type="checkbox" checked={music} onChange={event => {
                const on = event.target.checked;
                setMusic(on);
                setMusicEnabled(on);
            }} />
            Music
        </label>}
    </aside>;
}
