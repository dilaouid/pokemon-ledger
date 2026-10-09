import { Cameras, Input, Scene, Scenes } from 'phaser';
import { blip } from '../audio/blip';
import { EventBus } from '../EventBus';

export interface Controls {
    up(): boolean;
    down(): boolean;
    left(): boolean;
    right(): boolean;
    confirm(): boolean;
    cancel(): boolean;
}

const leaving = new WeakSet<Scene>();

export function openScene(scene: Scene): Controls {
    leaving.delete(scene);
    scene.cameras.main.roundPixels = true;
    scene.cameras.main.fadeIn(140, 8, 24, 32);
    EventBus.emit('current-scene-ready', scene);
    return bindControls(scene);
}

export function fadeTo(scene: Scene, key: string, data?: object): void {
    if (leaving.has(scene)) {
        return;
    }
    leaving.add(scene);
    scene.events.once(Scenes.Events.SHUTDOWN, () => {
        leaving.delete(scene);
    });
    blip(660, 0.05);
    scene.cameras.main.fadeOut(160, 8, 24, 32);
    scene.cameras.main.once(Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        scene.scene.start(key, data);
    });
}

function bindControls(scene: Scene): Controls {
    const keyboard = scene.input.keyboard;
    if (!keyboard) {
        throw new Error('Keyboard input is unavailable.');
    }

    const codes = Input.Keyboard.KeyCodes;
    const up = keyboard.addKey(codes.UP);
    const down = keyboard.addKey(codes.DOWN);
    const left = keyboard.addKey(codes.LEFT);
    const right = keyboard.addKey(codes.RIGHT);
    const w = keyboard.addKey(codes.W);
    const a = keyboard.addKey(codes.A);
    const s = keyboard.addKey(codes.S);
    const d = keyboard.addKey(codes.D);
    const enter = keyboard.addKey(codes.ENTER);
    const space = keyboard.addKey(codes.SPACE);
    const esc = keyboard.addKey(codes.ESC);
    const backspace = keyboard.addKey(codes.BACKSPACE);

    keyboard.addCapture([codes.UP, codes.DOWN, codes.LEFT, codes.RIGHT, codes.SPACE]);

    scene.events.once(Scenes.Events.SHUTDOWN, () => {
        keyboard.removeAllKeys(true);
    });

    const just = Input.Keyboard.JustDown;
    return {
        up: () => just(up) || just(w),
        down: () => just(down) || just(s),
        left: () => just(left) || just(a),
        right: () => just(right) || just(d),
        confirm: () => just(enter) || just(space),
        cancel: () => just(esc) || just(backspace),
    };
}
