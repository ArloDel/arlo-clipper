/**
 * @fileoverview Bundled caption style presets for one-click subtitle styling.
 * Each preset is a complete caption style matching the shape consumed by
 * generateAssSubtitleFile (lib/subtitles.js) and SubtitleOverlay live preview.
 * @module lib/captionPresets
 */

/**
 * @typedef {Object} CaptionPreset
 * @property {string} id - Stable preset identifier
 * @property {string} label - Display name
 * @property {string} emoji - Chip icon
 * @property {string} desc - Short Indonesian style summary
 * @property {{font: string, size: 'Small'|'Medium'|'Large', color: string, outline: boolean, shadow: boolean, animation: 'None'|'Karaoke'|'Pop'|'Slide Up'|'Blur'|'Bounce'}} style - Full style bundle
 */

export const CAPTION_PRESETS = [
  {
    id: 'beast',
    label: 'MrBeast',
    emoji: '⚡',
    desc: 'Kuning tebal, highlight per kata',
    style: { font: 'Impact', size: 'Large', color: '#FFFF00', outline: true, shadow: true, animation: 'Karaoke' },
  },
  {
    id: 'clean',
    label: 'Clean',
    emoji: '🧊',
    desc: 'Putih rapi, pop ringan',
    style: { font: 'Inter', size: 'Medium', color: '#FFFFFF', outline: true, shadow: false, animation: 'Pop' },
  },
  {
    id: 'hype',
    label: 'Hype',
    emoji: '🔥',
    desc: 'Merah besar, memantul',
    style: { font: 'Bangers', size: 'Large', color: '#FF3B3B', outline: true, shadow: true, animation: 'Bounce' },
  },
  {
    id: 'podcast',
    label: 'Podcast',
    emoji: '🎙️',
    desc: 'Kecil tenang, naik halus',
    style: { font: 'Montserrat', size: 'Small', color: '#FFFFFF', outline: true, shadow: false, animation: 'Slide Up' },
  },
  {
    id: 'neon',
    label: 'Neon',
    emoji: '🌀',
    desc: 'Cyan glow blur',
    style: { font: 'Roboto', size: 'Medium', color: '#22D3EE', outline: true, shadow: true, animation: 'Blur' },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    emoji: '⬛',
    desc: 'Tanpa efek apa pun',
    style: { font: 'Inter', size: 'Medium', color: '#FFFFFF', outline: false, shadow: false, animation: 'None' },
  },
];

/**
 * Fallback caption style used when the Home page supplies no options.
 * Matches the historical editor defaults.
 * @type {CaptionPreset['style']}
 */
export const DEFAULT_CAPTION_STYLE = {
  font: 'Impact',
  size: 'Medium',
  color: '#FFFF00',
  outline: true,
  shadow: true,
  animation: 'Pop',
};

/**
 * Resolves a preset by id.
 * @param {string} id - Preset id
 * @returns {CaptionPreset|null} The preset or null when unknown
 */
export function getCaptionPreset(id) {
  return CAPTION_PRESETS.find((p) => p.id === id) || null;
}
