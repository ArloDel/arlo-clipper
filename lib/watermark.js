/**
 * @fileoverview Watermark (branding) helpers shared by ASS subtitle generation
 * and the ffmpeg render filter graph.
 *
 * Data shape:
 * @typedef {Object} WatermarkConfig
 * @property {boolean} enabled - Whether the watermark is visible
 * @property {'text'|'image'} type - Watermark source kind
 * @property {string} [text=''] - Text watermark content (type='text')
 * @property {string} [imagePath=''] - Public image path (type='image', e.g. '/watermarks/xx.png')
 * @property {'top-left'|'top-right'|'bottom-left'|'bottom-right'} [position='top-right']
 * @property {number} [sizePct=6] - Height as % of video height (text font size / image height)
 * @property {number} [opacity=0.7] - 0..1 (images only; ASS text uses its own alpha)
 * @module lib/watermark
 */

export const WATERMARK_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

/**
 * Normalizes an untyped watermark object from the client into a safe config.
 *
 * @param {Object|null|undefined} raw - Raw watermark input
 * @returns {WatermarkConfig|null} Cleaned config, or null when effectively disabled
 */
export function normalizeWatermark(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const wm = {
    enabled: raw.enabled !== false,
    type: raw.type === 'image' ? 'image' : 'text',
    text: typeof raw.text === 'string' ? raw.text.trim().slice(0, 60) : '',
    imagePath: typeof raw.imagePath === 'string' ? raw.imagePath.trim() : '',
    position: WATERMARK_POSITIONS.includes(raw.position) ? raw.position : 'top-right',
    sizePct: Math.min(15, Math.max(2, Number(raw.sizePct) || 6)),
    opacity: Math.min(1, Math.max(0.05, Number.isFinite(Number(raw.opacity)) ? Number(raw.opacity) : 0.7)),
  };
  if (!wm.enabled) return null;
  if (wm.type === 'text' && !wm.text) return null;
  if (wm.type === 'image' && !wm.imagePath) return null;
  return wm;
}

/**
 * Computes padding offsets around the watermark (as fraction of frame).
 *
 * @param {string} position - Positions from WATERMARK_POSITIONS
 * @returns {{horizontal: 'left'|'right', vertical: 'top'|'bottom'}}
 */
export function positionAlignments(position) {
  const [vertical, horizontal] = String(position || 'top-right').split('-');
  return { vertical: vertical === 'bottom' ? 'bottom' : 'top', horizontal: horizontal === 'left' ? 'left' : 'right' };
}

/**
 * Removes characters that would be interpreted as ASS override tags.
 *
 * @param {string} text - Raw watermark text
 * @returns {string} Safe ASS dialogue text
 */
export function sanitizeAssText(text) {
  return String(text || '').replace(/[{}\\/]/g, '').trim();
}
