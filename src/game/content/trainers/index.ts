import type { Creature, TemplateId, TokenLink, Trainer } from '../../types';
import { TRAINER_IDS } from '../../../domain/battleRules';

/**
 * Drop a folder here to register an opponent:
 *   <id>/trainer.json   lines, victory NFT, link to their token
 *   <id>/face.png       required portrait
 *   <id>/sprite.png     optional full-body sprite
 * The folder name is the trainer id. No other file needs editing.
 */
const metas = import.meta.glob('./*/trainer.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const faces = import.meta.glob('./*/face.{png,svg}', { eager: true, import: 'default' }) as Record<string, string>;
const sprites = import.meta.glob('./*/sprite.{png,svg}', { eager: true, import: 'default' }) as Record<string, string>;

const TEMPLATES = new Set<TemplateId>(['beast', 'avian', 'blob', 'serpent', 'armor', 'brute', 'dragon']);

function folderId(path: string): string {
    const match = /^\.\/([^/]+)\//.exec(path);
    if (!match) {
        throw new Error(`Unexpected trainer path "${path}".`);
    }
    return match[1];
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null) {
        throw new Error(`${label} must be an object.`);
    }
    return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${label} must be a non-empty string.`);
    }
    return value;
}

function asNumber(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${label} must be a number.`);
    }
    return value;
}

function asLines(value: unknown, label: string): readonly string[] {
    if (!Array.isArray(value) || value.length === 0 || value.some((line) => typeof line !== 'string' || line.length === 0)) {
        throw new Error(`${label} must be a non-empty list of lines.`);
    }
    return value as string[];
}

function asLink(value: unknown, label: string): TokenLink {
    const link = asRecord(value, label);
    return {
        name: asString(link.name, `${label}.name`),
        contract: asString(link.contract, `${label}.contract`),
        tokenId: asString(link.tokenId, `${label}.tokenId`),
        url: asString(link.url, `${label}.url`),
    };
}

function asPokemon(id: string, value: unknown): { token: TokenLink; pokemon: Creature } {
    const mon = asRecord(value, `${id} pokemon`);
    const template = asString(mon.template, `${id} pokemon.template`);
    if (!TEMPLATES.has(template as TemplateId)) {
        throw new Error(`${id} pokemon.template is not a known body.`);
    }

    const name = asString(mon.name, `${id} pokemon.name`);
    return {
        token: {
            name,
            contract: asString(mon.contract, `${id} pokemon.contract`),
            tokenId: asString(mon.tokenId, `${id} pokemon.tokenId`),
            url: asString(mon.url, `${id} pokemon.url`),
        },
        pokemon: {
            id: `${id}-token`,
            name,
            kind: 'opponent',
            template: template as TemplateId,
            level: asNumber(mon.level, `${id} pokemon.level`),
            hp: asNumber(mon.hp, `${id} pokemon.hp`),
            attack: asNumber(mon.attack, `${id} pokemon.attack`),
            defense: asNumber(mon.defense, `${id} pokemon.defense`),
            move: asString(mon.move, `${id} pokemon.move`),
            blurb: asString(mon.blurb, `${id} pokemon.blurb`),
            flip: mon.flip === true,
            outline: asString(mon.outline, `${id} pokemon.outline`),
            body: asString(mon.body, `${id} pokemon.body`),
            shade: asString(mon.shade, `${id} pokemon.shade`),
            accent: asString(mon.accent, `${id} pokemon.accent`),
        },
    };
}

function loadTrainer(path: string, file: unknown): Trainer {
    const id = folderId(path);
    const faceUrl = faces[`./${id}/face.png`] ?? faces[`./${id}/face.svg`];
    if (!faceUrl) {
        throw new Error(`Trainer "${id}" is missing face.png.`);
    }

    const meta = asRecord(file, id);
    const creature = asPokemon(id, meta.pokemon);
    return {
        id,
        name: asString(meta.name, `${id} name`),
        order: asNumber(meta.order, `${id} order`),
        faceUrl,
        spriteUrl: sprites[`./${id}/sprite.png`] ?? sprites[`./${id}/sprite.svg`] ?? null,
        beforeFight: asLines(meta.beforeFight, `${id} beforeFight`),
        onWin: asLines(meta.onWin, `${id} onWin`),
        onLose: asLines(meta.onLose, `${id} onLose`),
        victoryNft: asLink(meta.victoryNft, `${id} victoryNft`),
        token: creature.token,
        pokemon: creature.pokemon,
    };
}

export const TRAINERS: readonly Trainer[] = Object.entries(metas)
    .map(([path, file]) => loadTrainer(path, file))
    .sort((a, b) => TRAINER_IDS.indexOf(a.id as typeof TRAINER_IDS[number]) - TRAINER_IDS.indexOf(b.id as typeof TRAINER_IDS[number]));

if (TRAINERS.length !== TRAINER_IDS.length || TRAINERS.some((trainer, id) => trainer.id !== TRAINER_IDS[id])) {
    throw new Error('Trainer content must match the deployed LedgerMon roster.');
}

export function findTrainer(id: string): Trainer | undefined {
    return TRAINERS.find((trainer) => trainer.id === id);
}
