/**
 * @fileoverview Path traversal guards for API routes that touch files under public/.
 * @module lib/safePath
 */

import path from 'path';

const PUBLIC_ROOT = path.resolve(process.cwd(), 'public');

/** Safe id for filenames: letters, digits, underscore, dash only (no dots/slashes). */
export const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

export function isSafeId(id) {
  return typeof id === 'string' && SAFE_ID_RE.test(id);
}

/**
 * Resolves a public URL path (e.g. "/clips/abc.mp4?v=1") to an absolute disk path,
 * only if it stays inside one of the allowed public subfolders.
 *
 * @param {string} publicPath - Public relative path from the client
 * @param {string[]} [allowedDirs=['uploads','clips']] - Allowed subfolders of public/
 * @returns {string|null} Absolute disk path, or null when outside the allowed folders
 */
export function resolvePublicFile(publicPath, allowedDirs = ['uploads', 'clips']) {
  if (!publicPath || typeof publicPath !== 'string') return null;
  const clean = publicPath.split('?')[0].split('#')[0].replace(/\\/g, '/').replace(/^\/+/, '');
  const resolved = path.resolve(PUBLIC_ROOT, clean);
  const ok = allowedDirs.some((dir) => resolved.startsWith(path.join(PUBLIC_ROOT, dir) + path.sep));
  return ok ? resolved : null;
}
