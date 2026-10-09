import { Scene } from 'phaser';
import { AUDIO } from '../constants';

const TRACKS = [AUDIO.intro, AUDIO.menu, AUDIO.battle] as const;

/** Sits under a speaking voice during a screen recording. */
const MUSIC_VOLUME = 0.2;
const MUSIC_MUTED = 'debug-music-muted';

type Track = (typeof TRACKS)[number];

let request = 0;
let enabled = loadEnabled();
let activeScene: Scene | null = null;
let lastKey: Track | null = null;

export function isMusicEnabled(): boolean {
    return enabled;
}

/** Debug switch. Off stops the current loop; on resumes the track for this scene. */
export function setMusicEnabled(on: boolean): void {
    enabled = on;
    try {
        if (on) localStorage.removeItem(MUSIC_MUTED);
        else localStorage.setItem(MUSIC_MUTED, '1');
    } catch {
        // Private mode can block storage. The switch still applies for this page.
    }
    if (!activeScene) return;
    if (!on) {
        stopMusic(activeScene);
        return;
    }
    if (lastKey) playMusic(activeScene, lastKey);
}

function loadEnabled(): boolean {
    try {
        return localStorage.getItem(MUSIC_MUTED) !== '1';
    } catch {
        return true;
    }
}

/** Loop one soundtrack. The same track keeps playing when the next scene asks for it again. */
export function playMusic(scene: Scene, key: Track): void {
    activeScene = scene;
    lastKey = key;
    if (!enabled) {
        stopMusic(scene);
        return;
    }
    const mine = ++request;
    const start = () => {
        if (mine !== request || !enabled) {
            return;
        }
        for (const other of TRACKS) {
            if (other !== key) {
                scene.sound.stopByKey(other);
            }
        }
        if (!scene.cache.audio.exists(key)) {
            return;
        }
        if (scene.sound.isPlaying(key)) {
            const current = scene.sound.get(key);
            const sounds = Array.isArray(current) ? current : current ? [current] : [];
            for (const sound of sounds) {
                sound.setVolume(MUSIC_VOLUME);
            }
            return;
        }
        scene.sound.play(key, { loop: true, volume: MUSIC_VOLUME });
    };

    if (scene.sound.locked) {
        scene.sound.once('unlocked', start);
        return;
    }
    start();
}

export function stopMusic(scene: Scene): void {
    request += 1;
    for (const key of TRACKS) {
        scene.sound.stopByKey(key);
    }
}
