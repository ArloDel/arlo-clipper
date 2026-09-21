/**
 * Supported video extensions for local uploads and direct video links
 */
export const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.mkv', '.m4v', '.avi', '.ts'];

function getExt(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  const idx = filePath.lastIndexOf('.');
  return idx !== -1 ? filePath.substring(idx).toLowerCase() : '';
}

function getBase(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  const clean = filePath.replace(/\\/g, '/');
  return clean.substring(clean.lastIndexOf('/') + 1);
}

/**
 * Extract Google Drive file ID from various sharing and preview URL formats
 * @param {string} url - Google Drive URL
 * @returns {string|null} - Extracted File ID or null
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
 * Convert Google Drive share link to direct download / stream link
 * @param {string} url - Google Drive URL
 * @returns {string|null} - Direct download URL
 */
export function getGoogleDriveDirectLink(url) {
  const fileId = extractGoogleDriveId(url);
  if (!fileId) return null;
  return `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
}

/**
 * Convert Dropbox share link to direct download link (forcing dl=1)
 * @param {string} url - Dropbox URL
 * @returns {string} - Direct download URL
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
 * Detect the type of source from an input string (URL or local path)
 * @param {string} input - URL or file path
 * @returns {string} - 'local-file' | 'youtube' | 'tiktok' | 'google-drive' | 'dropbox' | 'direct-video' | 'generic-url' | 'unknown'
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
 * Full resolver that parses any URL or local path into a standardized media source descriptor
 * @param {string} input - URL or local file path
 * @returns {object} - Source descriptor
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
 * Sanitizes a file name for safe filesystem storage
 * @param {string} name - Original file name
 * @returns {string} - Clean sanitized file name
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
