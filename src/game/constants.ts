/** Internal Game Boy Color resolution. The canvas is scaled up with nearest-neighbor. */
export const SCREEN = {
    width: 160,
    height: 144,
} as const;

export const FONT = {
    key: 'gbc',
    texture: 'gbc-font',
    cellW: 6,
    cellH: 8,
    cols: 16,
} as const;

export const SCENES = {
    boot: 'Boot',
    title: 'Title',
    intro: 'Intro',
    starter: 'Starter',
    opponents: 'Opponents',
    battle: 'Battle',
} as const;

/** Cream-and-ink palette close to a 1990s Pokémon window. */
export const PALETTE = {
    ink: 0x181830,
    paper: 0xf8f8d0,
    gold: 0xf8e060,
    white: 0xf8f8f8,
    mute: 0x90a0b8,
    locked: 0x788098,
    cleared: 0x78d8a8,
    hpGreen: 0x48d848,
    hpYellow: 0xf8d030,
    hpRed: 0xf83830,
    hpTrough: 0x385838,
    skyHigh: 0xb8e0f8,
    skyMid: 0x88c8f0,
    skyLow: 0x5898e0,
    grass: 0x48a040,
    grassDark: 0x307030,
    platform: 0xc8a060,
    platformDark: 0x987040,
    night: 0x0c1840,
} as const;

export const AUDIO = {
    intro: 'audio-intro',
    menu: 'audio-menu',
    battle: 'audio-battle',
} as const;

export const TEXTURE = {
    seal: 'seal',
    anthonySprite: 'cast-anthony',
    alpaca: 'cast-alpaca',
} as const;

export function trainerFaceKey(id: string): string {
    return `trainer-face-${id}`;
}

export function trainerSpriteKey(id: string): string {
    return `trainer-sprite-${id}`;
}

export function frontKey(id: string): string {
    return `mon-${id}`;
}

export function backKey(id: string): string {
    return `mon-${id}-back`;
}
