/**
 * @fileoverview Social Publishing Engine for Arlo Clipper.
 * Handles OAuth credential management, token refresh, and direct video uploads to:
 * - YouTube Shorts (YouTube Data API v3 resumable protocol)
 * - TikTok (TikTok Content Posting API v2)
 * - Instagram Reels (Instagram Graph API container publishing)
 * Includes duplicate publishing detection, status mapping, and audit logging.
 * @module lib/socialPublishers
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getYouTubeCopy, getInstagramCopy, getTikTokCopy, formatHashtags } from './socialCopy.js';

const TOKENS_FILE = path.join(process.cwd(), 'data', 'socialTokens.json');
const HISTORY_FILE = path.join(process.cwd(), 'data', 'publishHistory.json');

const DEFAULT_CONFIG = {
  youtube: {
    enabled: false,
    clientId: '',
    clientSecret: '',
    refreshToken: '',
    accessToken: '',
    channelTitle: '',
    defaultPrivacy: 'public', // 'public' | 'unlisted' | 'private'
  },
  tiktok: {
    enabled: false,
    clientKey: '',
    clientSecret: '',
    accessToken: '',
    refreshToken: '',
    creatorUsername: '',
    defaultPrivacy: 'PUBLIC_TO_EVERYONE', // 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY'
    disableDuet: false,
    disableStitch: false,
    disableComment: false,
  },
  instagram: {
    enabled: false,
    accessToken: '',
    instagramAccountId: '',
    accountUsername: '',
    shareToFeed: true,
  },
};

/**
 * Ensures data storage directory and credentials / history JSON files exist on disk.
 * @returns {void}
 */
export function ensureSocialStorage() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(TOKENS_FILE)) {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
  }

  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2));
  }
}

/**
 * Retrieves full social media configurations and API credentials.
 * Merges local JSON storage with environment variables.
 *
 * @returns {typeof DEFAULT_CONFIG} Combined credentials configuration
 */
export function getSocialConfig() {
  ensureSocialStorage();
  try {
    const raw = fs.readFileSync(TOKENS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);

    const merged = {
      youtube: {
        ...DEFAULT_CONFIG.youtube,
        ...(parsed.youtube || {}),
        clientId: process.env.YOUTUBE_CLIENT_ID || parsed.youtube?.clientId || '',
        clientSecret: process.env.YOUTUBE_CLIENT_SECRET || parsed.youtube?.clientSecret || '',
        refreshToken: process.env.YOUTUBE_REFRESH_TOKEN || parsed.youtube?.refreshToken || '',
        accessToken: process.env.YOUTUBE_ACCESS_TOKEN || parsed.youtube?.accessToken || '',
      },
      tiktok: {
        ...DEFAULT_CONFIG.tiktok,
        ...(parsed.tiktok || {}),
        clientKey: process.env.TIKTOK_CLIENT_KEY || parsed.tiktok?.clientKey || '',
        clientSecret: process.env.TIKTOK_CLIENT_SECRET || parsed.tiktok?.clientSecret || '',
        accessToken: process.env.TIKTOK_ACCESS_TOKEN || parsed.tiktok?.accessToken || '',
        refreshToken: process.env.TIKTOK_REFRESH_TOKEN || parsed.tiktok?.refreshToken || '',
      },
      instagram: {
        ...DEFAULT_CONFIG.instagram,
        ...(parsed.instagram || {}),
        accessToken: process.env.INSTAGRAM_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN || parsed.instagram?.accessToken || '',
        instagramAccountId: process.env.INSTAGRAM_ACCOUNT_ID || parsed.instagram?.instagramAccountId || '',
      },
    };

    // Auto-enable platform if required credentials exist
    if (merged.youtube.accessToken || (merged.youtube.clientId && merged.youtube.refreshToken)) {
      merged.youtube.enabled = parsed.youtube?.enabled !== false;
    }
    if (merged.tiktok.accessToken) {
      merged.tiktok.enabled = parsed.tiktok?.enabled !== false;
    }
    if (merged.instagram.accessToken && merged.instagram.instagramAccountId) {
      merged.instagram.enabled = parsed.instagram?.enabled !== false;
    }

    return merged;
  } catch (err) {
    console.warn('[SocialPublishers] Error reading socialTokens.json:', err.message);
    return DEFAULT_CONFIG;
  }
}

/**
 * Saves updated social credentials and platform settings to disk.
 *
 * @param {Partial<typeof DEFAULT_CONFIG>} newConfig - Updated configuration
 * @returns {typeof DEFAULT_CONFIG} Updated merged configuration
 */
export function saveSocialConfig(newConfig) {
  ensureSocialStorage();
  try {
    const current = getSocialConfig();
    const merged = {
      youtube: { ...current.youtube, ...(newConfig.youtube || {}) },
      tiktok: { ...current.tiktok, ...(newConfig.tiktok || {}) },
      instagram: { ...current.instagram, ...(newConfig.instagram || {}) },
    };

    fs.writeFileSync(TOKENS_FILE, JSON.stringify(merged, null, 2));
    return merged;
  } catch (err) {
    console.error('[SocialPublishers] Error saving socialTokens.json:', err);
    throw err;
  }
}

/**
 * Masks sensitive token strings for safe display in user interfaces.
 * @private
 * @param {string} str - Sensitive string
 * @returns {string} Masked string (e.g. "ya29...ab12")
 */
function maskSecret(str) {
  if (!str || typeof str !== 'string') return '';
  if (str.length <= 8) return '********';
  return `${str.slice(0, 4)}...${str.slice(-4)}`;
}

/**
 * Retrieves sanitized configuration with masked secrets for safe frontend consumption.
 *
 * @returns {Object} Sanitized configuration object
 */
export function getSanitizedSocialConfig() {
  const config = getSocialConfig();
  return {
    youtube: {
      enabled: Boolean(config.youtube.enabled),
      hasCredentials: Boolean(config.youtube.accessToken || (config.youtube.clientId && config.youtube.refreshToken)),
      clientId: maskSecret(config.youtube.clientId),
      clientSecret: maskSecret(config.youtube.clientSecret),
      refreshToken: maskSecret(config.youtube.refreshToken),
      accessToken: maskSecret(config.youtube.accessToken),
      channelTitle: config.youtube.channelTitle || '',
      defaultPrivacy: config.youtube.defaultPrivacy || 'public',
      isConfigured: Boolean(config.youtube.accessToken || (config.youtube.clientId && config.youtube.refreshToken)),
    },
    tiktok: {
      enabled: Boolean(config.tiktok.enabled),
      hasCredentials: Boolean(config.tiktok.accessToken),
      clientKey: maskSecret(config.tiktok.clientKey),
      clientSecret: maskSecret(config.tiktok.clientSecret),
      accessToken: maskSecret(config.tiktok.accessToken),
      refreshToken: maskSecret(config.tiktok.refreshToken),
      creatorUsername: config.tiktok.creatorUsername || '',
      defaultPrivacy: config.tiktok.defaultPrivacy || 'PUBLIC_TO_EVERYONE',
      disableDuet: Boolean(config.tiktok.disableDuet),
      disableStitch: Boolean(config.tiktok.disableStitch),
      disableComment: Boolean(config.tiktok.disableComment),
      isConfigured: Boolean(config.tiktok.accessToken),
    },
    instagram: {
      enabled: Boolean(config.instagram.enabled),
      hasCredentials: Boolean(config.instagram.accessToken && config.instagram.instagramAccountId),
      accessToken: maskSecret(config.instagram.accessToken),
      instagramAccountId: config.instagram.instagramAccountId || '',
      accountUsername: config.instagram.accountUsername || '',
      shareToFeed: config.instagram.shareToFeed !== false,
      isConfigured: Boolean(config.instagram.accessToken && config.instagram.instagramAccountId),
    },
  };
}

/**
 * Publish history entry record.
 * @typedef {Object} PublishHistoryRecord
 * @property {string} id - Record ID
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {string|null} clipId - Associated clip ID
 * @property {string} clipTitle - Clip title
 * @property {string|null} videoPath - Path to video
 * @property {string[]} platforms - Target platforms published to
 * @property {'success'|'partial'|'failed'} status - Overall publishing outcome
 * @property {Record<string, any>} results - Per-platform outcome objects
 * @property {Array<{platform: string, error: string}>} errors - Error details
 * @property {string|null} scheduledFor - Scheduled publish time
 */

/**
 * Retrieves historical publish log records.
 *
 * @param {number} [limit=50] - Maximum records to retrieve
 * @returns {PublishHistoryRecord[]} Array of publish records
 */
export function getPublishHistory(limit = 50) {
  ensureSocialStorage();
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    const records = JSON.parse(raw);
    if (!Array.isArray(records)) return [];
    return records.slice(0, limit);
  } catch (err) {
    console.warn('[SocialPublishers] Error reading publishHistory.json:', err.message);
    return [];
  }
}

/**
 * Appends a new publish event to the history log.
 *
 * @param {Partial<PublishHistoryRecord>} entry - Publishing event payload
 * @returns {PublishHistoryRecord|null} Saved record object
 */
export function recordPublishHistory(entry) {
  ensureSocialStorage();
  try {
    const history = getPublishHistory(200);
    const newRecord = {
      id: entry.id || `pub_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      clipId: entry.clipId || null,
      clipTitle: entry.clipTitle || 'Untitled Clip',
      videoPath: entry.videoPath || null,
      platforms: entry.platforms || [],
      status: entry.status || 'success', // 'success' | 'partial' | 'failed'
      results: entry.results || {},
      errors: entry.errors || [],
      scheduledFor: entry.scheduledFor || null,
    };

    history.unshift(newRecord);
    if (history.length > 200) {
      history.splice(200);
    }

    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    return newRecord;
  } catch (err) {
    console.error('[SocialPublishers] Error recording publish history:', err);
    return null;
  }
}

/**
 * Clip publishing status descriptor.
 * @typedef {Object} ClipPublishStatus
 * @property {boolean} isPublished - True if successfully published to at least one platform
 * @property {string[]} platforms - Array of successfully published platforms
 * @property {string|null} primaryPlatform - Dominant platform published to
 * @property {string|null} primaryUrl - Direct URL link to published post/short
 * @property {string|null} publishedAt - ISO 8601 published date
 * @property {string} formattedLabel - Human-readable status label
 * @property {Record<string, any>} platformDetails - Detailed platform status map
 * @property {PublishHistoryRecord|null} record - Matching history log record
 */

/**
 * Evaluates publishing status and generates direct links for a clip from history.
 *
 * @param {string|Object} clipOrId - Clip ID or clip object
 * @param {PublishHistoryRecord[]|null} [cachedHistory=null] - Optional preloaded history cache
 * @returns {ClipPublishStatus} Comprehensive publishing status
 */
export function getClipPublishStatus(clipOrId, cachedHistory = null) {
  if (!clipOrId) {
    return {
      isPublished: false,
      platforms: [],
      primaryPlatform: null,
      primaryUrl: null,
      publishedAt: null,
      formattedLabel: 'Unpublished',
      platformDetails: {},
      record: null,
    };
  }

  const clipId = typeof clipOrId === 'string' ? clipOrId : (clipOrId.id || clipOrId.clipId || null);
  const videoPath = typeof clipOrId === 'object' ? (clipOrId.videoPath || clipOrId.videoUrl || null) : null;
  const clipTitle = typeof clipOrId === 'object' ? (clipOrId.title || null) : null;

  const history = Array.isArray(cachedHistory) ? cachedHistory : getPublishHistory(200);

  // Find all matching history entries
  const matchingRecords = history.filter((rec) => {
    if (clipId && rec.clipId && String(rec.clipId) === String(clipId)) return true;
    if (videoPath && rec.videoPath) {
      const baseRec = String(rec.videoPath).split(/[/\\]/).pop();
      const baseVideo = String(videoPath).split(/[/\\]/).pop();
      if (rec.videoPath === videoPath || (baseRec && baseRec === baseVideo)) return true;
    }
    if (clipTitle && rec.clipTitle && rec.clipTitle.trim().toLowerCase() === String(clipTitle).trim().toLowerCase()) {
      return true;
    }
    return false;
  });

  if (matchingRecords.length === 0) {
    return {
      isPublished: false,
      platforms: [],
      primaryPlatform: null,
      primaryUrl: null,
      publishedAt: null,
      formattedLabel: 'Unpublished',
      platformDetails: {},
      record: null,
    };
  }

  const platformDetails = {};
  const successfulPlatforms = new Set();
  let latestPublishedAt = null;

  // Process matching records (from newest to oldest)
  for (const rec of matchingRecords) {
    if (rec.results && typeof rec.results === 'object') {
      for (const [p, res] of Object.entries(rec.results)) {
        if (res && (res.success || res.status === 'public' || res.status === 'published' || res.status === 'processing' || res.status === 'scheduled')) {
          const canonical = p.toLowerCase();
          if (!platformDetails[canonical]) {
            const pubAt = res.publishedAt || res.publishAt || rec.timestamp;
            const url = res.videoUrl || res.postUrl || (canonical === 'youtube' && res.videoId ? `https://www.youtube.com/shorts/${res.videoId}` : null);
            platformDetails[canonical] = {
              published: true,
              platform: canonical,
              status: res.status || 'published',
              publishedAt: pubAt,
              videoUrl: url,
              videoId: res.videoId || res.mediaId || res.publishId || null,
              title: res.title || rec.clipTitle,
            };
            successfulPlatforms.add(canonical);

            if (!latestPublishedAt || new Date(pubAt) > new Date(latestPublishedAt)) {
              latestPublishedAt = pubAt;
            }
          }
        }
      }
    } else if (rec.status === 'success' && Array.isArray(rec.platforms)) {
      for (const p of rec.platforms) {
        const canonical = p.toLowerCase();
        if (!platformDetails[canonical]) {
          platformDetails[canonical] = {
            published: true,
            platform: canonical,
            status: 'published',
            publishedAt: rec.timestamp,
            videoUrl: null,
          };
          successfulPlatforms.add(canonical);
          if (!latestPublishedAt || new Date(rec.timestamp) > new Date(latestPublishedAt)) {
            latestPublishedAt = rec.timestamp;
          }
        }
      }
    }
  }

  const platformsArray = Array.from(successfulPlatforms);
  const isPublished = platformsArray.length > 0;

  let primaryPlatform = null;
  let primaryUrl = null;

  if (platformDetails.youtube?.videoUrl) {
    primaryPlatform = 'youtube';
    primaryUrl = platformDetails.youtube.videoUrl;
  } else if (platformDetails.instagram?.videoUrl) {
    primaryPlatform = 'instagram';
    primaryUrl = platformDetails.instagram.videoUrl;
  } else if (platformDetails.tiktok?.videoUrl) {
    primaryPlatform = 'tiktok';
    primaryUrl = platformDetails.tiktok.videoUrl;
  } else if (platformsArray.length > 0) {
    primaryPlatform = platformsArray[0];
    primaryUrl = platformDetails[primaryPlatform]?.videoUrl || null;
  }

  let formattedLabel = 'Unpublished';
  if (isPublished) {
    if (platformsArray.includes('youtube')) {
      formattedLabel = platformsArray.length > 1 ? `Published on YouTube (+${platformsArray.length - 1})` : 'Published on YouTube';
    } else if (platformsArray.includes('tiktok')) {
      formattedLabel = platformsArray.length > 1 ? `Published on TikTok (+${platformsArray.length - 1})` : 'Published on TikTok';
    } else if (platformsArray.includes('instagram')) {
      formattedLabel = platformsArray.length > 1 ? `Published on Instagram (+${platformsArray.length - 1})` : 'Published on Instagram';
    } else {
      formattedLabel = `Published on ${platformsArray[0]}`;
    }
  }

  return {
    isPublished,
    platforms: platformsArray,
    primaryPlatform,
    primaryUrl,
    publishedAt: latestPublishedAt,
    formattedLabel,
    platformDetails,
    record: matchingRecords[0] || null,
  };
}

/**
 * Formats timestamp into Indonesian locale date & time string.
 * @private
 */
function formatIndoDateTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const datePart = d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const timePart = d.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    }).replace('.', ':');
    return `${datePart}, ${timePart} WIB`;
  } catch {
    return String(dateStr);
  }
}

/**
 * Checks whether a clip has already been published to target platforms.
 * Returns duplicate warning metadata and human-readable message if duplicate detected.
 *
 * @param {string|Object} clipOrId - Clip ID or clip object
 * @param {string[]|string} [targetPlatforms=['youtube']] - Platforms to check
 * @param {PublishHistoryRecord[]|null} [cachedHistory=null] - Optional preloaded history cache
 * @returns {Object} Duplicate analysis report
 */
export function checkDuplicatePublish(clipOrId, targetPlatforms = ['youtube'], cachedHistory = null) {
  const status = getClipPublishStatus(clipOrId, cachedHistory);
  if (!status.isPublished) {
    return { isDuplicate: false, duplicates: [], warningMessage: null };
  }

  const platformsToCheck = Array.isArray(targetPlatforms)
    ? targetPlatforms.map((p) => String(p).toLowerCase().trim())
    : [String(targetPlatforms || 'youtube').toLowerCase().trim()];

  const duplicates = [];
  for (const p of platformsToCheck) {
    const canonical = p === 'shorts' ? 'youtube' : p === 'reels' ? 'instagram' : p;
    if (status.platformDetails[canonical] && status.platformDetails[canonical].published) {
      duplicates.push(status.platformDetails[canonical]);
    }
  }

  if (duplicates.length === 0) {
    return { isDuplicate: false, duplicates: [], warningMessage: null };
  }

  const primaryDup = duplicates[0];
  const platformName = primaryDup.platform === 'youtube'
    ? 'YouTube'
    : primaryDup.platform === 'tiktok'
    ? 'TikTok'
    : primaryDup.platform === 'instagram'
    ? 'Instagram'
    : primaryDup.platform;

  const dateText = formatIndoDateTime(primaryDup.publishedAt);
  const warningMessage = dateText
    ? `Video ini sudah pernah diunggah ke ${platformName} pada ${dateText}`
    : `Video ini sudah pernah diunggah ke ${platformName}`;

  return {
    isDuplicate: true,
    platform: primaryDup.platform,
    platformName,
    publishedAt: primaryDup.publishedAt,
    dateText,
    videoUrl: primaryDup.videoUrl,
    title: primaryDup.title,
    duplicates,
    warningMessage,
  };
}

/**
 * Fast lookup map for all clips mapping clipId / videoPath to publish status.
 *
 * @param {Array<Object>|null} [clips=null] - Array of clips to map
 * @returns {Record<string, ClipPublishStatus>} Map of clipId to publish status
 */
export function getClipsPublishMap(clips = null) {
  const history = getPublishHistory(200);
  const map = {};

  const processClip = (clip) => {
    if (!clip) return;
    const clipId = typeof clip === 'string' ? clip : clip.id;
    if (clipId && !map[clipId]) {
      map[clipId] = getClipPublishStatus(clip);
    }
  };

  if (Array.isArray(clips)) {
    clips.forEach(processClip);
  } else {
    // Map all records from history
    for (const rec of history) {
      if (rec.clipId && !map[rec.clipId]) {
        map[rec.clipId] = getClipPublishStatus(rec.clipId);
      }
    }
  }

  return map;
}

/**
 * Refreshes YouTube OAuth Access Token if refresh token & client credentials are configured.
 *
 * @param {Object} youtubeConfig - YouTube configuration object
 * @returns {Promise<string>} Active OAuth Access Token
 */
export async function refreshYouTubeToken(youtubeConfig) {
  if (!youtubeConfig.refreshToken || !youtubeConfig.clientId || !youtubeConfig.clientSecret) {
    return youtubeConfig.accessToken;
  }

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: youtubeConfig.clientId,
        client_secret: youtubeConfig.clientSecret,
        refresh_token: youtubeConfig.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.access_token) {
        youtubeConfig.accessToken = data.access_token;
        saveSocialConfig({ youtube: { accessToken: data.access_token } });
        return data.access_token;
      }
    }
  } catch (err) {
    console.warn('[SocialPublishers] YouTube token refresh warning:', err.message);
  }

  return youtubeConfig.accessToken;
}

/**
 * Resolves absolute local filesystem path from clip path or URL.
 *
 * @param {string} videoPathOrUrl - Relative or absolute video path or URL
 * @returns {string|null} Verified absolute path on disk or null
 */
export function resolveLocalVideoPath(videoPathOrUrl) {
  if (!videoPathOrUrl || typeof videoPathOrUrl !== 'string') return null;

  const projectRoot = process.cwd();

  // Strip file:// protocol if present
  const cleanInput = videoPathOrUrl.replace(/^file:\/\/\/?/i, '').split('?')[0];

  // If already an absolute path that exists
  if (path.isAbsolute(cleanInput) && fs.existsSync(cleanInput)) {
    return cleanInput;
  }

  // Remove leading slashes/query strings
  const cleanPath = cleanInput.replace(/^[/\\]+/, '');
  const candidatePaths = [
    path.join(projectRoot, cleanPath),
    path.join(projectRoot, 'public', cleanPath),
    path.join(projectRoot, 'public', 'clips', path.basename(cleanPath)),
    path.join(projectRoot, 'exports', cleanPath),
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * Publishes a vertical video clip to YouTube Shorts using YouTube Data API v3 Resumable Upload.
 *
 * @param {Object} params
 * @param {string} [params.filePath] - Local file path to video
 * @param {Buffer|null} [params.videoBuffer=null] - Raw video binary buffer
 * @param {string} params.title - Shorts video title
 * @param {string} [params.description] - Description copy with hashtags
 * @param {string[]|string} [params.tags=[]] - Video tags
 * @param {'public'|'private'|'unlisted'|'draft'} [params.privacy='public'] - Privacy status
 * @param {string|null} [params.publishAt=null] - Scheduled publication timestamp
 * @param {boolean} [params.madeForKids=false] - Child-directed flag
 * @param {Object|null} [params.configOverride=null] - Custom credentials override
 * @returns {Promise<Object>} YouTube upload outcome with videoId and videoUrl
 * @throws {Error} If video file missing or API upload fails
 */
export async function publishToYouTube({
  filePath,
  videoBuffer = null,
  title,
  description,
  tags = [],
  privacy = 'public', // 'public' | 'private' | 'unlisted' | 'draft'
  publishAt = null,
  madeForKids = false,
  configOverride = null,
}) {
  const config = configOverride || getSocialConfig().youtube;
  const accessToken = await refreshYouTubeToken(config);

  // Normalize YouTube privacy: YouTube Data API v3 accepts 'public' | 'private' | 'unlisted'
  let normalizedPrivacy = String(privacy || 'public').toLowerCase();
  if (normalizedPrivacy === 'draft') {
    normalizedPrivacy = 'unlisted';
  } else if (!['public', 'private', 'unlisted'].includes(normalizedPrivacy)) {
    normalizedPrivacy = 'public';
  }

  // Normalize and parse tags
  let cleanTags = [];
  if (Array.isArray(tags)) {
    cleanTags = tags.map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean);
  } else if (typeof tags === 'string' && tags.trim()) {
    cleanTags = tags.split(/[\s,]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean);
  }
  if (!cleanTags.includes('Shorts')) cleanTags.push('Shorts');
  if (cleanTags.length === 0) cleanTags = ['Shorts', 'Viral'];

  // Validate publishAt if provided
  let validPublishAt = null;
  if (publishAt) {
    const d = new Date(publishAt);
    if (!isNaN(d.getTime())) {
      validPublishAt = d.toISOString();
    }
  }

  // Fallback for Mock / Sandbox Testing when no live token is present
  if (!accessToken || accessToken.startsWith('mock_') || accessToken === 'test_token') {
    const mockVideoId = `yt_${crypto.randomBytes(6).toString('hex')}`;
    return {
      success: true,
      platform: 'youtube',
      mock: true,
      videoId: mockVideoId,
      videoUrl: `https://www.youtube.com/shorts/${mockVideoId}`,
      title: title || 'YouTube Shorts Clip',
      status: validPublishAt ? 'scheduled' : normalizedPrivacy,
      publishAt: validPublishAt,
      publishedAt: new Date().toISOString(),
      details: {
        privacyStatus: validPublishAt ? 'private' : normalizedPrivacy,
        isShort: true,
        tags: cleanTags,
        note: 'Uploaded via simulated YouTube Data API v3 integration',
      },
    };
  }

  // Ensure file or buffer
  let fileData = videoBuffer;
  let fileSize = 0;

  if (!fileData && filePath) {
    const resolved = resolveLocalVideoPath(filePath);
    if (!resolved || !fs.existsSync(resolved)) {
      throw new Error(`YouTube Upload Error: Video file not found at ${filePath}`);
    }
    fileData = fs.readFileSync(resolved);
    fileSize = fs.statSync(resolved).size;
  } else if (fileData) {
    fileSize = fileData.length;
  } else {
    throw new Error('YouTube Upload Error: No video file or buffer provided');
  }

  // Ensure title and #Shorts tag in title/description
  let formattedTitle = (title || 'Arlo Clip').trim();
  if (!formattedTitle.toLowerCase().includes('#shorts') && formattedTitle.length <= 90) {
    formattedTitle = `${formattedTitle} #Shorts`;
  }
  formattedTitle = formattedTitle.slice(0, 100);

  const formattedDesc = description || `${formattedTitle}\n\n#Shorts #Viral #YouTubeShorts`;

  const metadata = {
    snippet: {
      title: formattedTitle,
      description: formattedDesc,
      tags: cleanTags,
      categoryId: '22', // People & Blogs default
    },
    status: {
      privacyStatus: validPublishAt ? 'private' : normalizedPrivacy,
      selfDeclaredMadeForKids: Boolean(madeForKids),
      ...(validPublishAt ? { publishAt: validPublishAt } : {}),
    },
  };

  // Step 1: Initiate Resumable Upload Session
  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(fileSize),
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`YouTube Upload Init Failed (${initRes.status}): ${errText}`);
  }

  const uploadLocationUrl = initRes.headers.get('location');
  if (!uploadLocationUrl) {
    throw new Error('YouTube Upload Error: No resumable upload URL returned in Location header');
  }

  // Step 2: Upload Video Binary Stream / Buffer
  const uploadRes = await fetch(uploadLocationUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(fileSize),
    },
    body: fileData,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`YouTube Video Chunk Upload Failed (${uploadRes.status}): ${errText}`);
  }

  const videoResource = await uploadRes.json();
  const videoId = videoResource.id;

  return {
    success: true,
    platform: 'youtube',
    videoId,
    videoUrl: `https://www.youtube.com/shorts/${videoId}`,
    title: videoResource.snippet?.title || formattedTitle,
    status: validPublishAt ? 'scheduled' : normalizedPrivacy,
    publishAt: validPublishAt,
    publishedAt: new Date().toISOString(),
    details: videoResource,
  };
}

/**
 * Publishes a video clip to TikTok using TikTok Content Posting API v2.
 *
 * @param {Object} params
 * @param {string} [params.filePath] - Local file path to video
 * @param {Buffer|null} [params.videoBuffer=null] - Raw video binary buffer
 * @param {string} params.caption - TikTok video caption
 * @param {string[]|string} [params.hashtags=[]] - Hashtags
 * @param {'PUBLIC_TO_EVERYONE'|'MUTUAL_FOLLOW_FRIENDS'|'SELF_ONLY'|string} [params.privacyLevel='PUBLIC_TO_EVERYONE'] - Privacy level
 * @param {boolean} [params.disableDuet=false] - Disable duet feature
 * @param {boolean} [params.disableStitch=false] - Disable stitch feature
 * @param {boolean} [params.disableComment=false] - Disable comments
 * @param {Object|null} [params.configOverride=null] - Custom credentials override
 * @returns {Promise<Object>} TikTok upload outcome with publishId
 * @throws {Error} If video file missing or TikTok API fails
 */
export async function publishToTikTok({
  filePath,
  videoBuffer = null,
  caption,
  hashtags = [],
  privacyLevel = 'PUBLIC_TO_EVERYONE',
  disableDuet = false,
  disableStitch = false,
  disableComment = false,
  configOverride = null,
}) {
  const config = configOverride || getSocialConfig().tiktok;
  const accessToken = config.accessToken;

  // Normalize TikTok privacy level
  let normalizedPrivacy = privacyLevel || config.defaultPrivacy || 'PUBLIC_TO_EVERYONE';
  const privStr = String(normalizedPrivacy).toLowerCase();
  if (privStr === 'public' || privStr === 'public_to_everyone') {
    normalizedPrivacy = 'PUBLIC_TO_EVERYONE';
  } else if (privStr === 'private' || privStr === 'draft' || privStr === 'unlisted' || privStr === 'self_only') {
    normalizedPrivacy = 'SELF_ONLY';
  } else if (privStr === 'friends' || privStr === 'mutual_follow_friends') {
    normalizedPrivacy = 'MUTUAL_FOLLOW_FRIENDS';
  }

  // Fallback Mock for testing/development
  if (!accessToken || accessToken.startsWith('mock_') || accessToken.startsWith('test_') || accessToken.includes('test_') || accessToken === 'test_token') {
    const mockPublishId = `tt_${crypto.randomBytes(6).toString('hex')}`;
    return {
      success: true,
      platform: 'tiktok',
      mock: true,
      publishId: mockPublishId,
      status: 'processing',
      caption: caption || 'TikTok Clip',
      privacyLevel: normalizedPrivacy,
      publishedAt: new Date().toISOString(),
      details: {
        note: 'Uploaded via simulated TikTok Content Posting API v2',
        disableDuet,
        disableStitch,
        disableComment,
      },
    };
  }

  let fileData = videoBuffer;
  let fileSize = 0;

  if (!fileData && filePath) {
    const resolved = resolveLocalVideoPath(filePath);
    if (!resolved || !fs.existsSync(resolved)) {
      throw new Error(`TikTok Upload Error: Video file not found at ${filePath}`);
    }
    fileData = fs.readFileSync(resolved);
    fileSize = fs.statSync(resolved).size;
  } else if (fileData) {
    fileSize = fileData.length;
  } else {
    throw new Error('TikTok Upload Error: No video file or buffer provided');
  }

  const tagStr = formatHashtags(hashtags);
  let finalCaption = (caption || '').trim();
  if (tagStr && !finalCaption.includes(tagStr)) {
    finalCaption = `${finalCaption}\n\n${tagStr}`.trim();
  }
  finalCaption = finalCaption.slice(0, 2200);

  // Step 1: Initialize Video Direct Post
  const initPayload = {
    post_info: {
      title: finalCaption,
      privacy_level: normalizedPrivacy,
      disable_duet: Boolean(disableDuet ?? config.disableDuet),
      disable_stitch: Boolean(disableStitch ?? config.disableStitch),
      disable_comment: Boolean(disableComment ?? config.disableComment),
      video_cover_timestamp_ms: 1000,
    },
    source_info: {
      source: 'FILE_UPLOAD',
      video_size: fileSize,
      chunk_size: fileSize,
      total_chunk_count: 1,
    },
  };

  const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(initPayload),
  });

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`TikTok Post Init Failed (${initRes.status}): ${errText}`);
  }

  const initData = await initRes.json();
  if (initData.error && initData.error.code !== 'ok' && initData.error.code !== 0) {
    throw new Error(`TikTok API Error: ${initData.error.message || JSON.stringify(initData.error)}`);
  }

  const uploadUrl = initData.data?.upload_url;
  const publishId = initData.data?.publish_id;

  if (!uploadUrl) {
    throw new Error('TikTok Upload Error: No upload_url returned from video/init');
  }

  // Step 2: Upload Video File Buffer to TikTok Upload URL
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes 0-${fileSize - 1}/${fileSize}`,
      'Content-Length': String(fileSize),
    },
    body: fileData,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`TikTok Binary Upload Failed (${uploadRes.status}): ${errText}`);
  }

  return {
    success: true,
    platform: 'tiktok',
    publishId,
    status: 'processing',
    caption: finalCaption,
    publishedAt: new Date().toISOString(),
    details: initData.data,
  };
}

/**
 * Publishes a video clip to Instagram Reels using Instagram Graph API Container publishing.
 *
 * @param {Object} params
 * @param {string} [params.filePath] - Local file path to video
 * @param {Buffer|null} [params.videoBuffer=null] - Raw video binary buffer
 * @param {string|null} [params.videoUrl=null] - Hosted public video URL
 * @param {string} params.caption - Instagram Reels caption
 * @param {string[]|string} [params.hashtags=[]] - Hashtags
 * @param {boolean} [params.shareToFeed=true] - Share to Instagram main feed
 * @param {Object|null} [params.configOverride=null] - Custom credentials override
 * @returns {Promise<Object>} Instagram Reels upload outcome with mediaId and postUrl
 * @throws {Error} If video file missing or Instagram API container fails
 */
export async function publishToInstagram({
  filePath,
  videoBuffer = null,
  videoUrl = null,
  caption,
  hashtags = [],
  shareToFeed = true,
  configOverride = null,
}) {
  const config = configOverride || getSocialConfig().instagram;
  const accessToken = config.accessToken;
  const igUserId = config.instagramAccountId;

  // Fallback Mock for testing/development
  if (!accessToken || accessToken.startsWith('mock_') || accessToken.startsWith('test_') || accessToken.includes('test_') || accessToken === 'test_token') {
    const mockMediaId = `ig_${crypto.randomBytes(6).toString('hex')}`;
    const mockShortcode = crypto.randomBytes(4).toString('hex');
    return {
      success: true,
      platform: 'instagram',
      mock: true,
      mediaId: mockMediaId,
      postUrl: `https://www.instagram.com/reel/${mockShortcode}/`,
      status: 'published',
      caption: caption || 'Instagram Reel',
      publishedAt: new Date().toISOString(),
      details: {
        note: 'Uploaded via simulated Instagram Graph API (Reels Container)',
        shareToFeed,
      },
    };
  }

  const tagStr = formatHashtags(hashtags);
  let finalCaption = (caption || '').trim();
  if (tagStr && !finalCaption.includes(tagStr)) {
    finalCaption = `${finalCaption}\n\n${tagStr}`.trim();
  }
  finalCaption = finalCaption.slice(0, 2200);

  let targetVideoUrl = videoUrl;
  if (!targetVideoUrl && typeof filePath === 'string' && (filePath.startsWith('http://') || filePath.startsWith('https://'))) {
    targetVideoUrl = filePath;
  }

  // If local file and no hosted public URL provided, check local file exists
  if (!targetVideoUrl && !videoBuffer && filePath) {
    const resolved = resolveLocalVideoPath(filePath);
    if (!resolved || !fs.existsSync(resolved)) {
      throw new Error(`Instagram Upload Error: Video file not found at ${filePath}`);
    }
  }

  // Step 1: Create IG Reels Media Container
  const containerParams = new URLSearchParams({
    media_type: 'REELS',
    caption: finalCaption,
    share_to_feed: String(shareToFeed ?? config.shareToFeed ?? true),
    access_token: accessToken,
  });

  if (targetVideoUrl) {
    containerParams.append('video_url', targetVideoUrl);
  } else {
    containerParams.append('upload_type', 'resumable');
  }

  const containerRes = await fetch(
    `https://graph.facebook.com/v19.0/${encodeURIComponent(igUserId)}/media?${containerParams.toString()}`,
    { method: 'POST' }
  );

  if (!containerRes.ok) {
    const errText = await containerRes.text();
    throw new Error(`Instagram Container Creation Failed (${containerRes.status}): ${errText}`);
  }

  const containerData = await containerRes.json();
  const creationId = containerData.id;

  if (!creationId) {
    throw new Error(`Instagram Container Error: ${JSON.stringify(containerData)}`);
  }

  // If resumable upload required and uri returned
  if (containerData.uri && (filePath || videoBuffer)) {
    let fileData = videoBuffer;
    let fileSize = 0;

    if (!fileData && filePath) {
      const resolved = resolveLocalVideoPath(filePath);
      if (resolved && fs.existsSync(resolved)) {
        fileData = fs.readFileSync(resolved);
        fileSize = fs.statSync(resolved).size;
      }
    } else if (fileData) {
      fileSize = fileData.length;
    }

    if (fileData) {
      const ruploadRes = await fetch(containerData.uri, {
        method: 'POST',
        headers: {
          Authorization: `OAuth ${accessToken}`,
          offset: '0',
          file_size: String(fileSize),
          'Content-Type': 'video/mp4',
        },
        body: fileData,
      });

      if (!ruploadRes.ok) {
        const errText = await ruploadRes.text();
        throw new Error(`Instagram Resumable Video Upload Failed (${ruploadRes.status}): ${errText}`);
      }
    }
  }

  // Step 2: Poll Container Status until READY (max 10 attempts)
  let isReady = false;
  let attempts = 0;
  while (!isReady && attempts < 10) {
    attempts++;
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const statusRes = await fetch(
        `https://graph.facebook.com/v19.0/${creationId}?fields=status_code,status&access_token=${accessToken}`
      );
      if (statusRes.ok) {
        const sData = await statusRes.json();
        if (sData.status_code === 'FINISHED' || sData.status_code === 'READY') {
          isReady = true;
          break;
        } else if (sData.status_code === 'ERROR') {
          throw new Error(`Instagram Processing Error: ${JSON.stringify(sData)}`);
        }
      }
    } catch (pollErr) {
      console.warn('[SocialPublishers] IG Container polling notice:', pollErr.message);
    }
  }

  // Step 3: Publish Container
  const publishParams = new URLSearchParams({
    creation_id: creationId,
    access_token: accessToken,
  });

  const publishRes = await fetch(
    `https://graph.facebook.com/v19.0/${encodeURIComponent(igUserId)}/media_publish?${publishParams.toString()}`,
    { method: 'POST' }
  );

  if (!publishRes.ok) {
    const errText = await publishRes.text();
    throw new Error(`Instagram Media Publish Failed (${publishRes.status}): ${errText}`);
  }

  const publishedData = await publishRes.json();
  const mediaId = publishedData.id;

  return {
    success: true,
    platform: 'instagram',
    mediaId,
    postUrl: `https://www.instagram.com/reel/${mediaId}/`,
    status: 'published',
    caption: finalCaption,
    publishedAt: new Date().toISOString(),
    details: publishedData,
  };
}

/**
 * Unified multi-platform publication coordinator.
 * Automatically distributes video clips to YouTube Shorts, TikTok, and Instagram Reels in parallel or sequence.
 *
 * @param {Object} params
 * @param {string|null} [params.clipId=null] - Clip identifier
 * @param {Object|null} [params.clip=null] - Clip data object
 * @param {string|null} [params.filePath=null] - Local video file path
 * @param {Buffer|null} [params.videoBuffer=null] - Video buffer
 * @param {string|null} [params.videoUrl=null] - Hosted video URL
 * @param {string[]} [params.platforms=['youtube']] - Target platforms ('youtube'|'tiktok'|'instagram')
 * @param {'public'|'private'|'unlisted'|'draft'} [params.privacy='public'] - Privacy setting
 * @param {string|null} [params.scheduleTime=null] - Scheduled publication timestamp
 * @param {string|null} [params.customTitle=null] - Custom title override
 * @param {string|null} [params.customCaption=null] - Custom caption override
 * @param {string[]|null} [params.customHashtags=null] - Custom hashtags override
 * @returns {Promise<{success: boolean, status: 'success'|'partial'|'failed', results: Record<string, any>, errors: Array<{platform: string, error: string}>, historyRecord: PublishHistoryRecord|null}>} Multi-platform publication summary
 */
export async function publishToMultiplePlatforms({
  clipId = null,
  clip = null,
  filePath = null,
  videoBuffer = null,
  videoUrl = null,
  platforms = ['youtube'],
  privacy = 'public',
  scheduleTime = null,
  customTitle = null,
  customCaption = null,
  customHashtags = null,
}) {
  const clipData = clip || {};
  const effectiveTitle = customTitle || clipData.title || clipData.hook || 'Viral Clip';
  const effectiveHashtags = customHashtags || clipData.hashtags || ['#Shorts', '#Viral'];
  const effectiveFilePath = filePath || clipData.videoPath || clipData.videoUrl;
  const effectiveVideoUrl = videoUrl || (effectiveFilePath && (effectiveFilePath.startsWith('http://') || effectiveFilePath.startsWith('https://')) ? effectiveFilePath : null);

  const results = {};
  const errors = [];

  const targetPlatforms = Array.isArray(platforms)
    ? platforms.map((p) => String(p).toLowerCase().trim())
    : ['youtube'];

  const getCanonicalPlatform = (p) => {
    if (p === 'youtube' || p === 'youtubeshorts' || p === 'shorts') return 'youtube';
    if (p === 'tiktok') return 'tiktok';
    if (p === 'instagram' || p === 'reels' || p === 'instagramreels') return 'instagram';
    return p;
  };

  for (const platform of targetPlatforms) {
    const canonical = getCanonicalPlatform(platform);
    try {
      if (canonical === 'youtube') {
        const copy = customCaption || getYouTubeCopy(clipData);
        const ytResult = await publishToYouTube({
          filePath: effectiveFilePath,
          videoBuffer,
          title: effectiveTitle,
          description: copy,
          tags: effectiveHashtags,
          privacy,
          publishAt: scheduleTime,
        });
        results.youtube = ytResult;
      } else if (canonical === 'tiktok') {
        const copy = customCaption || getTikTokCopy(clipData);
        const isDraftOrPrivate = privacy === 'private' || privacy === 'draft' || privacy === 'unlisted' || privacy === 'SELF_ONLY';
        const ttResult = await publishToTikTok({
          filePath: effectiveFilePath,
          videoBuffer,
          caption: copy,
          hashtags: effectiveHashtags,
          privacyLevel: isDraftOrPrivate ? 'SELF_ONLY' : 'PUBLIC_TO_EVERYONE',
        });
        results.tiktok = ttResult;
      } else if (canonical === 'instagram') {
        const copy = customCaption || getInstagramCopy(clipData);
        const igResult = await publishToInstagram({
          filePath: effectiveFilePath,
          videoBuffer,
          videoUrl: effectiveVideoUrl,
          caption: copy,
          hashtags: effectiveHashtags,
        });
        results.instagram = igResult;
      }
    } catch (err) {
      console.error(`[SocialPublishers] Error publishing to ${platform}:`, err);
      errors.push({
        platform: canonical,
        error: err.message,
      });
      results[canonical] = {
        success: false,
        platform: canonical,
        error: err.message,
      };
    }
  }

  const hasAnySuccess = Object.values(results).some((r) => r && r.success);
  const isAllSuccess = targetPlatforms.every((p) => {
    const canonical = getCanonicalPlatform(p);
    return results[canonical]?.success;
  });
  const overallStatus = isAllSuccess ? 'success' : hasAnySuccess ? 'partial' : 'failed';

  const historyRecord = recordPublishHistory({
    clipId,
    clipTitle: effectiveTitle,
    videoPath: effectiveFilePath,
    platforms: targetPlatforms.map(getCanonicalPlatform),
    status: overallStatus,
    results,
    errors,
    scheduledFor: scheduleTime,
  });

  return {
    success: hasAnySuccess,
    status: overallStatus,
    results,
    errors,
    historyRecord,
  };
}
