import { GameObjects, Scene } from 'phaser';
import { PALETTE, SCREEN } from '../constants';
import type { VideoSpec } from '../data/videos';
import { addText } from './text';

interface Star {
    x: number;
    y: number;
    size: number;
}

const BARS = [0xc04040, 0xe0a030, 0xe0e040, 0x40a040, 0x4080d0, 0x8040a0];
const FILM_ASPECT = 16 / 9;

/**
 * Full-screen video layer.
 * A real clip is drawn as its own element over the Game Boy canvas, so the
 * 1280×720 film stays sharp. Until a clip is loaded, the same rectangle
 * shows a moving placeholder.
 */
export class VideoSlot {
    isLiveVideo = false;
    private video: GameObjects.Video | null = null;
    private film: HTMLVideoElement | null = null;
    private caption: HTMLDivElement | null = null;
    private graphics: GameObjects.Graphics | null = null;
    private label: GameObjects.BitmapText | null = null;
    private spec: VideoSpec | null = null;
    private readonly stars: Star[];

    constructor(private readonly scene: Scene) {
        this.stars = Array.from({ length: 16 }, () => ({
            x: Math.floor(Math.random() * SCREEN.width),
            y: Math.floor(Math.random() * 100),
            size: Math.random() > 0.75 ? 2 : 1,
        }));
        this.scene.events.once('shutdown', () => this.destroy());
    }

    play(spec: VideoSpec, onEnded?: () => void): void {
        this.clearPlaceholder();
        this.spec = spec;

        const cached = spec.enabled && this.scene.cache.video.exists(spec.key);
        this.isLiveVideo = cached;
        if (!cached) {
            this.graphics = this.scene.add.graphics().setDepth(0);
            this.label = addText(this.scene, 4, 4, spec.label, PALETTE.mute).setDepth(2);
            return;
        }

        if (!this.video) {
            const video = this.scene.add.video(SCREEN.width / 2, SCREEN.height / 2, spec.key);
            video.setVisible(false);
            this.video = video;
            this.mount(video.video);
        }

        this.video.off(GameObjects.Events.VIDEO_COMPLETE);
        if (!spec.loop && onEnded) {
            this.video.once(GameObjects.Events.VIDEO_COMPLETE, onEnded);
        }
        if (this.video.getVideoKey() === spec.key) {
            this.video.play(spec.loop);
        } else {
            this.video.changeSource(spec.key, true, spec.loop);
        }
        this.place();
        this.keepMuted();
    }

    setCaption(text: string, visible: boolean): void {
        if (!this.isLiveVideo) {
            return;
        }
        const caption = this.ensureCaption();
        caption.textContent = text;
        caption.classList.toggle('is-dim', !visible);
        this.place();
    }

    /** Fade the film out with the scene transition. */
    dismiss(): void {
        if (this.film) {
            this.film.style.opacity = '0';
        }
        if (this.caption) {
            this.caption.style.opacity = '0';
        }
    }

    update(time: number): void {
        if (this.isLiveVideo) {
            this.place();
            this.keepMuted();
            return;
        }

        if (!this.graphics || !this.spec) {
            return;
        }

        this.graphics.clear();
        if (this.spec.loop) {
            this.drawLoop(time);
            return;
        }
        this.drawIntro(time);
    }

    private mount(element: HTMLVideoElement | null | undefined): void {
        if (!element || this.film === element) {
            return;
        }
        element.classList.add('intro-film');
        element.playsInline = true;
        element.tabIndex = -1;
        element.muted = true;
        this.film = element;
        this.place();
        document.body.appendChild(element);
    }

    private ensureCaption(): HTMLDivElement {
        if (!this.caption) {
            const caption = document.createElement('div');
            caption.className = 'intro-caption';
            document.body.appendChild(caption);
            this.caption = caption;
        }
        return this.caption;
    }

    private place(): void {
        const rect = this.scene.game.canvas.getBoundingClientRect();
        if (this.film) {
            this.film.style.left = `${rect.left}px`;
            this.film.style.top = `${rect.top}px`;
            this.film.style.width = `${rect.width}px`;
            this.film.style.height = `${rect.height}px`;
        }
        if (!this.caption) {
            return;
        }
        const videoHeight = Math.min(rect.height, rect.width / FILM_ASPECT);
        const bar = (rect.height - videoHeight) / 2;
        const band = Math.max(28, bar);
        this.caption.style.left = `${rect.left}px`;
        this.caption.style.width = `${rect.width}px`;
        this.caption.style.height = `${band}px`;
        this.caption.style.top = `${rect.bottom - band}px`;
    }

    /** Films stay muted. Intro, menu, and battle music come from the mp3 tracks. */
    private keepMuted(): void {
        const element = this.video?.video;
        if (element) {
            element.muted = true;
        }
    }

    private drawIntro(time: number): void {
        const graphics = this.graphics;
        if (!graphics) {
            return;
        }

        const shift = Math.floor(time / 180) % BARS.length;
        const band = Math.ceil(SCREEN.width / BARS.length);
        for (let i = 0; i < BARS.length; i += 1) {
            graphics.fillStyle(BARS[(i + shift) % BARS.length], 1);
            graphics.fillRect(i * band, 0, band + 1, SCREEN.height);
        }

        const scan = Math.floor(time / 24) % SCREEN.height;
        graphics.fillStyle(0x081018, 0.4);
        graphics.fillRect(0, scan, SCREEN.width, 2);
    }

    private drawLoop(time: number): void {
        const graphics = this.graphics;
        if (!graphics) {
            return;
        }

        graphics.fillStyle(PALETTE.night, 1);
        graphics.fillRect(0, 0, SCREEN.width, SCREEN.height);
        graphics.fillStyle(0x183060, 1);
        graphics.fillRect(0, 96, SCREEN.width, 48);

        this.stars.forEach((star, index) => {
            if (Math.floor(time / 260 + index) % 5 === 0) {
                return;
            }
            graphics.fillStyle(PALETTE.white, 1);
            graphics.fillRect(star.x, star.y, star.size, star.size);
        });

        const moonX = 118 + Math.round(Math.sin(time / 900) * 3);
        graphics.fillStyle(0xf8e8b0, 1);
        for (let y = -6; y <= 6; y += 1) {
            const span = Math.round(6 * Math.sqrt(Math.max(0, 1 - (y / 6) ** 2)));
            graphics.fillRect(moonX - span, 28 + y, span * 2, 1);
        }
    }

    private clearPlaceholder(): void {
        this.graphics?.destroy();
        this.graphics = null;
        this.label?.destroy();
        this.label = null;
    }

    private destroy(): void {
        this.video?.off(GameObjects.Events.VIDEO_COMPLETE);
        this.video?.stop();
        this.film?.remove();
        this.film = null;
        this.caption?.remove();
        this.caption = null;
        this.clearPlaceholder();
        this.video = null;
        this.isLiveVideo = false;
    }
}
