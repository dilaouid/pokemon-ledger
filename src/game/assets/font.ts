import { GameObjects, Scene, Textures } from 'phaser';
import { FONT, PALETTE } from '../constants';
import { GLYPHS } from './glyphs';

/** Colors are baked into the glyphs so text stays correct on the Canvas renderer too. */
const FACES: ReadonlyArray<{ key: string; color: string }> = [
    { key: FONT.key, color: '#181830' },
    { key: 'gbc-light', color: '#f8f8f8' },
    { key: 'gbc-gold', color: '#f8e060' },
    { key: 'gbc-mute', color: '#90a0b8' },
    { key: 'gbc-cleared', color: '#78d8a8' },
    { key: 'gbc-locked', color: '#788098' },
];

const FONT_BY_TINT = new Map<number, string>([
    [PALETTE.ink, FONT.key],
    [PALETTE.white, 'gbc-light'],
    [PALETTE.gold, 'gbc-gold'],
    [PALETTE.mute, 'gbc-mute'],
    [PALETTE.cleared, 'gbc-cleared'],
    [PALETTE.locked, 'gbc-locked'],
]);

export function fontKeyFor(tint: number): string {
    return FONT_BY_TINT.get(tint) ?? FONT.key;
}

/** Build the GBC bitmap font from the glyph table and register it with Phaser 4. */
export function registerFont(scene: Scene): void {
    if (scene.cache.bitmapFont.exists(FONT.key)) {
        return;
    }

    FACES.forEach((face) => paintFace(scene, face.key, face.color));
}

function paintFace(scene: Scene, key: string, color: string): void {
    const textureKey = `${key}-font`;
    const rowCount = Math.ceil(GLYPHS.length / FONT.cols);
    const width = FONT.cols * FONT.cellW;
    const height = rowCount * FONT.cellH;

    if (scene.textures.exists(textureKey)) {
        scene.textures.remove(textureKey);
    }

    const canvas = scene.textures.createCanvas(textureKey, width, height);
    if (!canvas) {
        throw new Error(`Could not allocate font texture ${key}.`);
    }

    const context = canvas.getContext();
    context.clearRect(0, 0, width, height);
    context.fillStyle = color;

    GLYPHS.forEach((glyph, index) => {
        const col = index % FONT.cols;
        const row = Math.floor(index / FONT.cols);
        const originX = col * FONT.cellW;
        const originY = row * FONT.cellH;

        glyph.rows.forEach((bits, dy) => {
            for (let dx = 0; dx < bits.length; dx += 1) {
                if (bits[dx] === '1') {
                    context.fillRect(originX + dx, originY + dy, 1, 1);
                }
            }
        });
    });

    canvas.refresh();
    canvas.setFilter(Textures.FilterMode.NEAREST);

    const parsed = GameObjects.RetroFont.Parse(scene, {
        image: textureKey,
        'offset.x': 0,
        'offset.y': 0,
        width: FONT.cellW,
        height: FONT.cellH,
        chars: GLYPHS.map((glyph) => glyph.ch).join(''),
        charsPerRow: FONT.cols,
        'spacing.x': 0,
        'spacing.y': 0,
        lineSpacing: 0,
    });

    scene.cache.bitmapFont.add(key, parsed);
}
