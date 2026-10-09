import { GameObjects, Scene } from 'phaser';
import { fontKeyFor } from '../assets/font';
import { CHARSET } from '../assets/glyphs';
import { FONT, PALETTE } from '../constants';

export function normalize(text: string): string {
    let out = '';
    for (const ch of text.toUpperCase()) {
        out += ch === '\n' || CHARSET.has(ch) ? ch : ' ';
    }
    return out;
}

export function wrapText(text: string, maxChars: number): string {
    const lines: string[] = [];

    for (const paragraph of text.split('\n')) {
        const words = paragraph.split(' ').filter((word) => word.length > 0);
        let line = '';

        for (const word of words) {
            const next = line.length > 0 ? `${line} ${word}` : word;
            if (next.length > maxChars && line.length > 0) {
                lines.push(line);
                line = word;
            } else {
                line = next;
            }
        }

        lines.push(line);
    }

    return lines.join('\n');
}

export function addText(
    scene: Scene,
    x: number,
    y: number,
    text: string,
    tint: number = PALETTE.ink,
    size: number = FONT.cellW,
): GameObjects.BitmapText {
    return scene.add.bitmapText(x, y, fontKeyFor(tint), normalize(text), size);
}

export function tintText(node: GameObjects.BitmapText, tint: number): void {
    node.setFont(fontKeyFor(tint));
}

export function setLine(node: GameObjects.BitmapText, text: string): void {
    node.setText(normalize(text));
}
