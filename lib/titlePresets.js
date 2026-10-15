/**
 * @fileoverview Bundled opening-title presets burned into the first seconds of
 * a clip. Data shape matches what lib/subtitles.js consumes via the `titleBar`
 * parameter of generateAssSubtitleFile.
 * @module lib/titlePresets
 */

/**
 * @typedef {Object} TitleBarConfig
 * @property {boolean} enabled - Whether the opening title renders
 * @property {string} text - Title text (defaults from the clip hook)
 * @property {string} preset - Preset id from TITLE_PRESETS
 * @property {number} seconds - How long the title stays visible (1..5)
 * @property {'top'|'center'} position - Vertical placement
 */

/**
 * Preset bundles; sizePct = font height as % of video height.
 * Fonts restricted to the set packaged with the app (see caption presets).
 * @type {Array<{id:string,label:string,emoji:string,desc:string,style:{font:string,sizePct:number,color:string,outline:boolean,shadow:boolean,position:'top'|'center'}}>}
 */
export const TITLE_PRESETS = [
  {
    id: 'punch',
    label: 'Punch',
    emoji: '⚡',
    desc: 'Kuning besar, langsung nendang',
    style: { font: 'Impact', sizePct: 7, color: '#FFFF00', outline: true, shadow: true, position: 'top' },
  },
  {
    id: 'clean',
    label: 'Clean',
    emoji: '🧊',
    desc: 'Putih bersih, halus',
    style: { font: 'Inter', sizePct: 5.5, color: '#FFFFFF', outline: true, shadow: false, position: 'top' },
  },
  {
    id: 'drama',
    label: 'Drama',
    emoji: '🎬',
    desc: 'Merah tengah layar, sinematik',
    style: { font: 'Bangers', sizePct: 8, color: '#FF3B3B', outline: true, shadow: true, position: 'center' },
  },
  {
    id: 'neon',
    label: 'Neon',
    emoji: '🌀',
    desc: 'Cyan glow, moody',
    style: { font: 'Roboto', sizePct: 6, color: '#22D3EE', outline: true, shadow: true, position: 'top' },
  },
];

/**
 * Resolves a title preset by id (falls back to the first preset).
 * @param {string} id - Preset id
 * @returns {Object} Preset definition
 */
export function getTitlePreset(id) {
  return TITLE_PRESETS.find((p) => p.id === id) || TITLE_PRESETS[0];
}
