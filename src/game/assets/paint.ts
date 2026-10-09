import { Scene, Textures } from 'phaser';
import { TEXTURE, backKey, frontKey } from '../constants';
import { TRAINERS } from '../content/trainers';
import { CREATURES } from '../data/creatures';
import type { Creature } from '../types';
import { BACKS, FRONTS, SEAL, TEMPLATES } from './sprites';

export function paintWorld(scene: Scene): void {
    paintSprite(scene, TEXTURE.seal, SEAL, {
        x: '#181818',
        b: '#e03030',
        e: '#f8f8f8',
    });

    CREATURES.forEach((creature) => {
        const front = FRONTS[creature.id] ?? TEMPLATES[creature.template];
        paintSprite(scene, frontKey(creature.id), front, colorsOf(creature));

        const back = BACKS[creature.id];
        if (back) {
            paintSprite(scene, backKey(creature.id), back, colorsOf(creature));
        }
    });

    TRAINERS.forEach((trainer) => {
        const mon = trainer.pokemon;
        paintSprite(scene, frontKey(mon.id), TEMPLATES[mon.template], colorsOf(mon));
    });
}

function colorsOf(creature: Creature): Record<string, string> {
    return {
        x: creature.outline,
        b: creature.body,
        d: creature.shade,
        a: creature.accent,
        e: '#f8f8f8',
        p: '#181818',
        h: '#ffffff',
    };
}

export function paintSprite(
    scene: Scene,
    key: string,
    rows: readonly string[],
    colors: Record<string, string>,
): void {
    if (scene.textures.exists(key)) {
        return;
    }

    const height = rows.length;
    const width = rows[0]?.length ?? 0;
    const canvas = scene.textures.createCanvas(key, width, height);
    if (!canvas) {
        throw new Error(`Could not allocate texture ${key}.`);
    }

    const context = canvas.getContext();
    context.clearRect(0, 0, width, height);

    rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x += 1) {
            const pixel = row[x];
            if (pixel === '.') {
                continue;
            }
            const color = colors[pixel];
            if (!color) {
                throw new Error(`Missing color "${pixel}" for texture ${key}.`);
            }
            context.fillStyle = color;
            context.fillRect(x, y, 1, 1);
        }
    });

    canvas.refresh();
    canvas.setFilter(Textures.FilterMode.NEAREST);
}
