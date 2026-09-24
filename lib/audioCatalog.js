/**
 * @fileoverview Audio Catalog Presets and Metadata for Arlo Clipper.
 * Client-safe definitions of royalty-free BGM tracks, SFX sound effects, and ducking profiles.
 * @module lib/audioCatalog
 */

/**
 * BGM track catalog definition.
 * @typedef {Object} BgmTrack
 * @property {string} id - Unique track identifier ('none'|'upbeat-energetic'|'chill-lofi'|'dramatic-suspense'|'cinematic-epic'|'playful-fun')
 * @property {string} name - Display name
 * @property {string} genre - Music genre description
 * @property {string} description - Indonesian description of track atmosphere
 * @property {string} path - Public relative path to audio asset
 * @property {number} duration - Track loop length in seconds
 */

/**
 * Built-in royalty-free BGM tracks.
 * @type {BgmTrack[]}
 */
export const BGM_TRACKS = [
  {
    id: 'none',
    name: 'None (No BGM)',
    genre: 'Off',
    description: 'Tanpa musik latar',
    path: '',
    duration: 0,
  },
  {
    id: 'upbeat-energetic',
    name: 'Upbeat & Energetic',
    genre: 'Electronic / Pop',
    description: 'Ritme cepat berenergi, cocok untuk konten viral & tips',
    path: '/assets/audio/bgm/upbeat-energetic.wav',
    duration: 16,
  },
  {
    id: 'chill-lofi',
    name: 'Chill & Lofi Vibes',
    genre: 'Lofi Hip-Hop',
    description: 'Nuansa santai & hangat, cocok untuk podcast & edukasi',
    path: '/assets/audio/bgm/chill-lofi.wav',
    duration: 16,
  },
  {
    id: 'dramatic-suspense',
    name: 'Dramatic Suspense',
    genre: 'Cinematic Drone',
    description: 'Ketegangan mendalam & misteri, cocok untuk hook cerita',
    path: '/assets/audio/bgm/dramatic-suspense.wav',
    duration: 16,
  },
  {
    id: 'cinematic-epic',
    name: 'Cinematic Epic',
    genre: 'Orchestral Swell',
    description: 'Megah & menggugah emosi, cocok untuk momen puncak & motivasi',
    path: '/assets/audio/bgm/cinematic-epic.wav',
    duration: 16,
  },
  {
    id: 'playful-fun',
    name: 'Playful & Fun',
    genre: 'Acoustic / Marimba',
    description: 'Ceria & menghibur, cocok untuk komedi & vlog kasual',
    path: '/assets/audio/bgm/playful-fun.wav',
    duration: 16,
  },
];

/**
 * SFX sound effect definition.
 * @typedef {Object} SfxSound
 * @property {string} id - Unique SFX identifier ('pop'|'whoosh'|'swoosh'|'ding'|'impact'|'camera-shutter')
 * @property {string} name - Display name
 * @property {'ui'|'transition'|'accent'|'hook'} type - Sound effect category
 * @property {string} description - Indonesian description of sound function
 * @property {string} path - Public relative path to audio asset
 * @property {number} duration - SFX duration in seconds
 */

/**
 * Built-in royalty-free sound effects (SFX).
 * @type {SfxSound[]}
 */
export const SFX_SOUNDS = [
  {
    id: 'pop',
    name: 'Pop Bubble',
    type: 'ui',
    description: 'Suara pop renyah untuk subtitle & teks baru',
    path: '/assets/audio/sfx/pop.wav',
    duration: 0.15,
  },
  {
    id: 'whoosh',
    name: 'Fast Whoosh',
    type: 'transition',
    description: 'Transisi angin cepat untuk transisi adegan',
    path: '/assets/audio/sfx/whoosh.wav',
    duration: 0.4,
  },
  {
    id: 'swoosh',
    name: 'Smooth Swoosh',
    type: 'transition',
    description: 'Swoosh dinamis untuk kemunculan B-Roll',
    path: '/assets/audio/sfx/swoosh.wav',
    duration: 0.35,
  },
  {
    id: 'ding',
    name: 'Bright Ding',
    type: 'accent',
    description: 'Dentang lonceng untuk poin penting & tips',
    path: '/assets/audio/sfx/ding.wav',
    duration: 0.8,
  },
  {
    id: 'impact',
    name: 'Heavy Impact',
    type: 'hook',
    description: 'Dentuman bass punchy untuk hook awal video',
    path: '/assets/audio/sfx/impact.wav',
    duration: 0.7,
  },
  {
    id: 'camera-shutter',
    name: 'Camera Shutter',
    type: 'accent',
    description: 'Jepretan kamera untuk highlight visual',
    path: '/assets/audio/sfx/camera-shutter.wav',
    duration: 0.3,
  },
];

/**
 * Dynamic ducking presets.
 * @type {Record<'light'|'medium'|'heavy', {threshold: number, ratio: number, attack: number, release: number, dropPercent: string}>}
 */
export const DUCKING_PRESETS = {
  light: {
    threshold: 0.12,
    ratio: 3.0,
    attack: 30,
    release: 350,
    dropPercent: '35%',
  },
  medium: {
    threshold: 0.08,
    ratio: 5.5,
    attack: 25,
    release: 400,
    dropPercent: '65%',
  },
  heavy: {
    threshold: 0.04,
    ratio: 9.0,
    attack: 20,
    release: 500,
    dropPercent: '85%',
  },
};
