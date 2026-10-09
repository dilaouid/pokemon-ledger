export type TemplateId = 'beast' | 'avian' | 'blob' | 'serpent' | 'armor' | 'brute' | 'dragon';

export type CreatureKind = 'starter' | 'opponent';

export interface Creature {
    id: string;
    name: string;
    kind: CreatureKind;
    template: TemplateId;
    level: number;
    hp: number;
    attack: number;
    defense: number;
    move: string;
    blurb: string;
    /** Drawn facing the other way so shared templates read as different species. */
    flip: boolean;
    outline: string;
    body: string;
    shade: string;
    accent: string;
}

export interface Fighter {
    id: string;
    name: string;
    move: string;
    hp: number;
    maxHp: number;
}

export type BattleAction = 'attack' | 'defend';

export interface BattleEvent {
    text: string;
    /** When set, the line is spoken under this name plate. */
    speaker?: string;
    hp?: {
        side: 'player' | 'enemy';
        value: number;
    };
    faint?: 'player' | 'enemy';
    /** Flash this side when the blow lands. */
    hit?: 'player' | 'enemy';
}

export interface RunState {
    starterId: string | null;
    defeatedIds: string[];
}

export interface TokenLink {
    name: string;
    contract: string;
    tokenId: string;
    url: string;
}

export interface Trainer {
    id: string;
    name: string;
    order: number;
    faceUrl: string;
    /** Null until a sprite.png is dropped in the trainer folder. */
    spriteUrl: string | null;
    beforeFight: readonly string[];
    onWin: readonly string[];
    onLose: readonly string[];
    victoryNft: TokenLink;
    /** On-chain token that this trainer sends into battle. */
    token: TokenLink;
    pokemon: Creature;
}

export interface BattleLaunch {
    trainerId: string;
}
