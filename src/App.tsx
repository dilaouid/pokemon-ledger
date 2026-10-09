import { useEffect, useState } from 'react';
import { EventBus } from './game/EventBus';
import { DebugPanel } from './DebugPanel';
import { PhaserGame } from './PhaserGame';
import { WalletPanel } from './WalletPanel';

function App() {
    const [off, setOff] = useState(false);

    useEffect(() => {
        const shutdown = () => setOff(true);
        EventBus.on('power-off', shutdown);
        return () => {
            EventBus.off('power-off', shutdown);
        };
    }, []);

    if (off) {
        return (
            <div id="app" className="power-off">
                <p>u not true gamer</p>
            </div>
        );
    }

    return (
        <div id="app">
            <PhaserGame />
            <DebugPanel />
            <WalletPanel />
        </div>
    );
}

export default App;
