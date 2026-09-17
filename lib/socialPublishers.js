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
 * Ensure storage data directory and json files exist
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
 * Get social media configurations and credentials
 * Merges file storage with environment variables if present
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
 * Save updated social credentials and settings
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
 * Mask sensitive token strings for client-side display
 */
function maskSecret(str) {
  if (!str || typeof str !== 'string') return '';
  if (str.length <= 8) return '********';
  return `${str.slice(0, 4)}...${str.slice(-4)}`;
}

/**
 * Get sanitized configurations safe for frontend display
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
 * Get publish history records
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
 * Record a publish event in history log
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
 * Refresh YouTube OAuth Access Token if refresh token & client credentials are set
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
 * Resolve absolute file path on disk from clip or videoPath
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
 * ─────────────────────────────────────────────────────────────────────────────
 * YOUTUBE SHORTS PUBLISHER (YouTube Data API v3)
 * ─────────────────────────────────────────────────────────────────────────────
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
 * ─────────────────────────────────────────────────────────────────────────────
 * TIKTOK PUBLISHER (TikTok Content Posting API v2)
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function publishToTikTok({
  filePath,
  videoBuffer = null,
  caption,
  hashtags = [],
  privacyLevel = 'PUBLIC_TO_EVERYONE', // 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY'
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
 * ─────────────────────────────────────────────────────────────────────────────
 * INSTAGRAM REELS PUBLISHER (Instagram Graph API)
 * ─────────────────────────────────────────────────────────────────────────────
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
 * ─────────────────────────────────────────────────────────────────────────────
 * UNIFIED MULTI-PLATFORM PUBLISHER
 * ─────────────────────────────────────────────────────────────────────────────
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
