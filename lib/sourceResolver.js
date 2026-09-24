/**
 * @fileoverview Multi-Source Video Input Resolver for Arlo Clipper.
 * Normalizes, identifies, and resolves various input sources including local files,
 * YouTube URLs, TikTok links, Google Drive shares, Dropbox direct links, and raw MP4 streams.
 * @module lib/sourceResolver
 */

/**
 * Supported video file extensions for local filesystem uploads and direct HTTP streams.
 * @type {string[]}
 */
export const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.mkv', '.m4v', '.avi', '.ts'];

/**
 * Extracts file extension in lowercase with leading dot.
 * @private
 * @param {string} filePath - Path or filename
 * @returns {string} Extension (e.g. '.mp4') or empty string
 */
function getExt(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  const idx = filePath.lastIndexOf('.');
  return idx !== -1 ? filePath.substring(idx).toLowerCase() : '';
}

/**
 * Extracts basename from a file path or URL path.
 * @private
 * @param {string} filePath - Path string
 * @returns {string} Filename with extension
 */
function getBase(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  const clean = filePath.replace(/\\/g, '/');
  return clean.substring(clean.lastIndexOf('/') + 1);
}

/**
 * Extracts Google Drive file ID from various sharing, preview, and folder URL formats.
 * Supports /file/d/{id}, /file/u/{n}/d/{id}, ?id={id}, /open?id={id}, /folders/{id}, etc.
 *
 * @param {string} url - Raw Google Drive URL
 * @returns {string|null} Extracted alphanumeric File ID or null if unparseable
 * @example
 * extractGoogleDriveId('https://drive.google.com/file/d/1A2b3C4d5E6F/view?usp=sharing');
 * // => '1A2b3C4d5E6F'
 */
export function extractGoogleDriveId(url) {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim();

  // Format 1: /file/d/{id}, /file/u/{n}/d/{id}, or /d/{id}
  const fileDMatch = trimmed.match(/(?:\/file\/d\/|\/file\/u\/\d+\/d\/|\/d\/)([a-zA-Z0-9_-]+)/);
  if (fileDMatch && fileDMatch[1]) {
    return fileDMatch[1];
  }

  // Format 2: ?id={id} or &id={id}
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch && idParamMatch[1]) {
    return idParamMatch[1];
  }

  // Format 3: /open?id={id}
  const openIdMatch = trimmed.match(/\/open\?[^#]*id=([a-zA-Z0-9_-]+)/);
  if (openIdMatch && openIdMatch[1]) {
    return openIdMatch[1];
  }

  // Format 4: /folders/{id} or /drive/folders/{id} or /drive/u/{n}/folders/{id}
  const folderMatch = trimmed.match(/(?:\/folders\/|\/drive\/folders\/|\/drive\/u\/\d+\/folders\/|\/drive\/u\/\d+\/mobile\/folders\/)([a-zA-Z0-9_-]+)/);
  if (folderMatch && folderMatch[1]) {
    return folderMatch[1];
  }

  return null;
}

/**
 * Converts a Google Drive sharing URL into a direct stream/download URL with confirmation bypass.
 *
 * @param {string} url - Google Drive URL
 * @returns {string|null} Direct download URL or null if invalid file ID
 * @example
 * getGoogleDriveDirectLink('https://drive.google.com/file/d/1AbC.../view');
 * // => 'https://drive.google.com/uc?export=download&id=1AbC...&confirm=t'
 */
export function getGoogleDriveDirectLink(url) {
  const fileId = extractGoogleDriveId(url);
  if (!fileId) return null;
  return `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
}

/**
 * Converts a Dropbox preview/share link to a direct binary download URL (dl=1).
 *
 * @param {string} url - Dropbox URL
 * @returns {string} Direct download URL
 * @example
 * getDropboxDirectLink('https://www.dropbox.com/s/xyz123/video.mp4?dl=0');
 * // => 'https://www.dropbox.com/s/xyz123/video.mp4?dl=1'
 */
export function getDropboxDirectLink(url) {
  if (!url || typeof url !== 'string') return url;

  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('dropbox.com') && !parsed.hostname.includes('dropboxusercontent.com')) {
      return url;
    }

    // If already direct dropboxusercontent, return as is
    if (parsed.hostname.includes('dropboxusercontent.com')) {
      return url;
    }

    // Replace or add dl=1
    parsed.searchParams.set('dl', '1');
    // Remove raw= if present to avoid conflict
    parsed.searchParams.delete('raw');
    return parsed.toString();
  } catch {
    // Fallback regex replacement if URL parsing fails
    if (url.includes('dl=0')) {
      return url.replace('dl=0', 'dl=1');
    }
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}dl=1`;
  }
}

/**
 * Source type classification identifier.
 * @typedef {'local-file'|'youtube'|'tiktok'|'google-drive'|'dropbox'|'direct-video'|'generic-url'|'unknown'} SourceType
 */

/**
 * Detects the media source category from an input string (URL or filesystem path).
 *
 * @param {string} input - URL, local path, or storage reference
 * @returns {SourceType} Identified source type enum
 * @example
 * detectSourceType('https://www.youtube.com/watch?v=dQw4w9WgXcQ'); // => 'youtube'
 * detectSourceType('/uploads/meeting.mp4'); // => 'local-file'
 */
export function detectSourceType(input) {
  if (!input || typeof input !== 'string') return 'unknown';

  const trimmed = input.trim();
  const normalized = trimmed.replace(/\\/g, '/');

  // Check 1: Local file path
  if (
    normalized.startsWith('/uploads/') ||
    normalized.startsWith('/clips/') ||
    normalized.startsWith('uploads/') ||
    normalized.startsWith('clips/') ||
    normalized.startsWith('public/uploads/') ||
    normalized.startsWith('public/clips/') ||
    normalized.startsWith('file://') ||
    /^[a-zA-Z]:\//.test(normalized) || // Windows absolute path (e.g. C:/...)
    (normalized.startsWith('/') && !normalized.startsWith('//') && !normalized.startsWith('/http') && SUPPORTED_VIDEO_EXTENSIONS.some((ext) => normalized.toLowerCase().endsWith(ext)))
  ) {
    return 'local-file';
  }

  // Parse as URL for web sources
  try {
    const urlObj = new URL(trimmed.startsWith('//') ? `https:${trimmed}` : trimmed);
    const hostname = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname.toLowerCase();

    // YouTube
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      return 'youtube';
    }

    // Google Drive
    if (hostname.includes('drive.google.com') || hostname.includes('docs.google.com')) {
      return 'google-drive';
    }

    // Dropbox
    if (hostname.includes('dropbox.com') || hostname.includes('dropboxusercontent.com')) {
      return 'dropbox';
    }

    // TikTok
    if (hostname.includes('tiktok.com')) {
      return 'tiktok';
    }

    // Direct Video Link (URL ending with video extension)
    if (SUPPORTED_VIDEO_EXTENSIONS.some((ext) => pathname.endsWith(ext))) {
      return 'direct-video';
    }

    return 'generic-url';
  } catch {
    // If not a valid URL, check if it has a video file extension
    const ext = getExt(trimmed);
    if (SUPPORTED_VIDEO_EXTENSIONS.includes(ext)) {
      return 'local-file';
    }
    return 'unknown';
  }
}

/**
 * Standardized media source descriptor returned by {@link resolveSource}.
 * @typedef {Object} SourceDescriptor
 * @property {SourceType} sourceType - The detected source platform/type
 * @property {string} originalInput - Original raw input string provided
 * @property {string} resolvedUrl - Normalized or streamable URL / local URI
 * @property {string|null} [directStreamUrl] - Direct download stream link (e.g. for Google Drive/Dropbox)
 * @property {string|null} [localFilePath] - Normalized path if local filesystem file
 * @property {string|null} [fileName] - Suggested or extracted file name
 * @property {string} platformName - Human-readable platform name (e.g. "YouTube", "Local Upload")
 * @property {string|null} [fileId] - Video or File ID (e.g. YouTube Video ID or Drive ID)
 * @property {boolean} isLocal - True if source resides on local filesystem
 * @property {boolean} isValid - True if source was successfully recognized and parseable
 */

/**
 * Full media source resolver. Parses any URL or filesystem path into a standardized media descriptor.
 *
 * @param {string} input - URL or local file path
 * @returns {SourceDescriptor} Standardized media source descriptor
 * @example
 * const desc = resolveSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 * // desc.sourceType => 'youtube', desc.fileId => 'dQw4w9WgXcQ', desc.platformName => 'YouTube'
 */
export function resolveSource(input) {
  if (!input || typeof input !== 'string') {
    return {
      sourceType: 'unknown',
      originalInput: input || '',
      resolvedUrl: '',
      localFilePath: null,
      platformName: 'Unknown',
      fileId: null,
      isLocal: false,
      isValid: false,
    };
  }

  const trimmed = input.trim();
  const sourceType = detectSourceType(trimmed);

  switch (sourceType) {
    case 'local-file': {
      let cleanPath = trimmed.replace(/^file:\/\//i, '').replace(/\\/g, '/');
      // If path is relative to public, normalize to leading slash
      if (cleanPath.startsWith('public/')) {
        cleanPath = cleanPath.replace(/^public/, '');
      } else if (cleanPath.startsWith('uploads/') || cleanPath.startsWith('clips/')) {
        cleanPath = `/${cleanPath}`;
      } else if (!cleanPath.startsWith('/') && !/^[a-zA-Z]:\//.test(cleanPath)) {
        cleanPath = `/uploads/${cleanPath}`;
      }

      const fileName = getBase(cleanPath);

      return {
        sourceType: 'local-file',
        originalInput: trimmed,
        resolvedUrl: cleanPath,
        localFilePath: cleanPath,
        fileName,
        platformName: 'Local Upload',
        fileId: null,
        isLocal: true,
        isValid: true,
      };
    }

    case 'google-drive': {
      const fileId = extractGoogleDriveId(trimmed);
      const directLink = getGoogleDriveDirectLink(trimmed);

      return {
        sourceType: 'google-drive',
        originalInput: trimmed,
        resolvedUrl: directLink || trimmed,
        directStreamUrl: directLink,
        localFilePath: null,
        platformName: 'Google Drive',
        fileId,
        isLocal: false,
        isValid: Boolean(fileId),
      };
    }

    case 'dropbox': {
      const directLink = getDropboxDirectLink(trimmed);

      return {
        sourceType: 'dropbox',
        originalInput: trimmed,
        resolvedUrl: directLink,
        directStreamUrl: directLink,
        localFilePath: null,
        platformName: 'Dropbox',
        fileId: null,
        isLocal: false,
        isValid: true,
      };
    }

    case 'tiktok': {
      return {
        sourceType: 'tiktok',
        originalInput: trimmed,
        resolvedUrl: trimmed,
        directStreamUrl: null,
        localFilePath: null,
        platformName: 'TikTok',
        fileId: null,
        isLocal: false,
        isValid: true,
      };
    }

    case 'youtube': {
      const videoIdMatch = trimmed.match(/(?:v=|youtu\.be\/|youtube\.com\/(?:embed\/|shorts\/))([^&?/\s]+)/);
      const videoId = videoIdMatch ? videoIdMatch[1] : null;

      return {
        sourceType: 'youtube',
        originalInput: trimmed,
        resolvedUrl: trimmed,
        directStreamUrl: null,
        localFilePath: null,
        platformName: 'YouTube',
        fileId: videoId,
        isLocal: false,
        isValid: true,
      };
    }

    case 'direct-video': {
      let fileName = 'video.mp4';
      try {
        const parsed = new URL(trimmed);
        fileName = getBase(parsed.pathname) || 'video.mp4';
      } catch {
        // fallback
      }

      return {
        sourceType: 'direct-video',
        originalInput: trimmed,
        resolvedUrl: trimmed,
        directStreamUrl: trimmed,
        fileName,
        localFilePath: null,
        platformName: 'Direct Video',
        fileId: null,
        isLocal: false,
        isValid: true,
      };
    }

    case 'generic-url': {
      return {
        sourceType: 'generic-url',
        originalInput: trimmed,
        resolvedUrl: trimmed,
        directStreamUrl: null,
        localFilePath: null,
        platformName: 'Web Video',
        fileId: null,
        isLocal: false,
        isValid: true,
      };
    }

    default:
      return {
        sourceType: 'unknown',
        originalInput: trimmed,
        resolvedUrl: trimmed,
        localFilePath: null,
        platformName: 'Unknown',
        fileId: null,
        isLocal: false,
        isValid: false,
      };
  }
}

/**
 * Sanitizes an arbitrary file name string for cross-platform safe filesystem storage.
 *
 * @param {string} name - Raw file name
 * @returns {string} Sanitized safe file name (max 100 chars, no illegal characters)
 * @example
 * sanitizeFileName('my cool video / podcast: episode #1.mp4');
 * // => 'my_cool_video___podcast__episode_#1.mp4'
 */
export function sanitizeFileName(name) {
  if (!name || typeof name !== 'string') return 'video.mp4';
  const clean = name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') // Replace illegal characters
    .replace(/\s+/g, '_') // Replace whitespace with underscore
    .replace(/_{2,}/g, '_') // Collapse multiple underscores
    .trim();
  return clean.substring(0, 100) || 'video.mp4';
}
