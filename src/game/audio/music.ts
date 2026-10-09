import { Scene } from 'phaser';
import { AUDIO } from '../constants';

const TRACKS = [AUDIO.intro, AUDIO.menu, AUDIO.battle] as const;

type Track = (typeof TRACKS)[number];

let request = 0;

/** Loop one soundtrack. The same track keeps playing when the next scene asks for it again. */
export function playMusic(scene: Scene, key: Track): void {
    const mine = ++request;
    const start = () => {
        if (mine !== request) {
            return;
        }
        for (const other of TRACKS) {
            if (other !== key) {
                scene.sound.stopByKey(other);
            }
        }
        if (!scene.cache.audio.exists(key) || scene.sound.isPlaying(key)) {
            return;
        }
        scene.sound.play(key, { loop: true });
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
