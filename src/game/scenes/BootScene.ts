import { Scene, Textures } from 'phaser';
import { registerFont } from '../assets/font';
import { paintWorld } from '../assets/paint';
import { CAST } from '../content/cast';
import { TRAINERS } from '../content/trainers';
import { AUDIO, SCENES, TEXTURE, trainerFaceKey, trainerSpriteKey } from '../constants';
import { VIDEOS, type VideoSpec } from '../data/videos';

export class BootScene extends Scene {
    constructor() {
        super(SCENES.boot);
    }

    preload(): void {
        const clips = Object.values(VIDEOS) as VideoSpec[];
        clips.forEach((spec) => {
            // Phaser 4 dereferences a null URL for unsupported codecs. Keep the existing fallback.
            if (spec.enabled && this.game.device.video.getVideoURL(spec.url)) {
                // Muted load so the film can autoplay. Music comes from the mp3 tracks.
                this.load.video(spec.key, spec.url, true);
            }
        });

        this.load.audio(AUDIO.intro, 'assets/audio/intro.mp3');
        this.load.audio(AUDIO.menu, 'assets/audio/menu.mp3');
        this.load.audio(AUDIO.battle, 'assets/audio/battle.mp3');
        this.load.image(TEXTURE.anthonySprite, CAST.anthony);
        this.load.image(TEXTURE.alpaca, CAST.alpaca);
        TRAINERS.forEach((trainer) => {
            this.load.image(trainerFaceKey(trainer.id), trainer.faceUrl);
            if (trainer.spriteUrl) {
                this.load.image(trainerSpriteKey(trainer.id), trainer.spriteUrl);
            }
        });
    }

    create(): void {
        this.sharpen(TEXTURE.anthonySprite);
        this.sharpen(TEXTURE.alpaca);
        TRAINERS.forEach((trainer) => {
            this.sharpen(trainerFaceKey(trainer.id));
            if (trainer.spriteUrl) {
                this.sharpen(trainerSpriteKey(trainer.id));
            }
        });

        registerFont(this);
        paintWorld(this);
        this.scene.start(SCENES.title);
    }

    private sharpen(key: string): void {
        if (this.textures.exists(key)) {
            this.textures.get(key).setFilter(Textures.FilterMode.NEAREST);
        }
    }
}
