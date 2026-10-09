let audio: AudioContext | null = null;

/** Short square-wave tick, in the spirit of a Game Boy cursor. */
export function blip(freq = 480, duration = 0.045): void {
    const context = getAudio();
    if (!context) {
        return;
    }

    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.025, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + duration);
}

function getAudio(): AudioContext | null {
    if (typeof window.AudioContext === 'undefined') {
        return null;
    }
    if (!audio) {
        audio = new window.AudioContext();
    }
    if (audio.state === 'suspended') {
        void audio.resume();
    }
    return audio;
}
