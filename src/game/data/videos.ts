/**
 * Title films live in `public/assets/video`.
 * The opening clip plays once, then the loop holds the title until the player continues.
 */
export interface VideoSpec {
    key: string;
    url: string;
    enabled: boolean;
    loop: boolean;
    label: string;
}

export const VIDEOS = {
    intro: {
        key: 'video-intro',
        url: 'assets/video/intro.mp4',
        enabled: true,
        loop: false,
        label: 'INTRO TAPE',
    },
    titleLoop: {
        key: 'video-title-loop',
        url: 'assets/video/title-loop.mp4',
        enabled: true,
        loop: true,
        label: 'LOOP TAPE',
    },
} as const satisfies Record<string, VideoSpec>;
