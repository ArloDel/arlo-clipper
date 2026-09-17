import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import youtubedl from 'youtube-dl-exec';
import { processWebhookVideoJob } from './webhookPipeline.js';
import { getAllCopies, formatHashtags, formatTimestamp } from './socialCopy.js';
import { publishToMultiplePlatforms } from './socialPublishers.js';

const CONFIG_FILE = path.join(process.cwd(), 'data', 'botConfig.json');
const HISTORY_FILE = path.join(process.cwd(), 'data', 'botHistory.json');

const DEFAULT_CONFIG = {
  enabled: false,
  channelUrl: '',
  channelId: '',
  channelName: '',
  checkIntervalMinutes: 60,
  maxVideosPerCheck: 1,
  maxClipsPerVideo: 3,
  lastCheckedAt: null,
  nextCheckAt: null,
  preset: {
    ratio: '9:16',
    faceTracking: false,
    splitScreen: false,
    subtitles: true,
    subtitleAnimation: 'Pop',
    font: 'Impact',
    fontSize: 'Medium',
    color: '#FFFF00',
    broll: 'auto',
    bgm: 'upbeat-energetic',
    ducking: 'medium',
    sfx: true,
  },
  exportSettings: {
    autoExport: true,
    exportDir: 'exports',
    generateTxtMetadata: true,
    generateJsonMetadata: true,
  },
  autoPublish: {
    enabled: false,
    platforms: ['youtube'], // 'youtube' | 'tiktok' | 'instagram'
    privacy: 'public', // 'public' | 'draft' | 'unlisted' | 'private'
  },
};

/**
 * Ensure data directory and config/history files exist
 */
function ensureStorage() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
  }

  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(
      HISTORY_FILE,
      JSON.stringify({ processedVideos: [], logs: [] }, null, 2)
    );
  }
}

/**
 * Get current bot configuration
 */
export function getBotConfig() {
  ensureStorage();
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      preset: { ...DEFAULT_CONFIG.preset, ...(parsed.preset || {}) },
      exportSettings: { ...DEFAULT_CONFIG.exportSettings, ...(parsed.exportSettings || {}) },
      autoPublish: { ...DEFAULT_CONFIG.autoPublish, ...(parsed.autoPublish || {}) },
    };
  } catch (err) {
    console.warn('[LocalBot] Error reading botConfig.json:', err.message);
    return DEFAULT_CONFIG;
  }
}

/**
 * Save updated bot configuration
 */
export function saveBotConfig(newConfig, { restartScheduler = true } = {}) {
  ensureStorage();
  try {
    const current = getBotConfig();
    const merged = {
      ...current,
      ...newConfig,
      preset: { ...current.preset, ...(newConfig.preset || {}) },
      exportSettings: { ...current.exportSettings, ...(newConfig.exportSettings || {}) },
      autoPublish: { ...current.autoPublish, ...(newConfig.autoPublish || {}) },
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));

    // Handle scheduler restart / interval change if requested
    if (restartScheduler) {
      if (merged.enabled) {
        startBotScheduler();
      } else {
        stopBotScheduler();
      }
    }

    return merged;
  } catch (err) {
    console.error('[LocalBot] Error saving botConfig.json:', err);
    throw err;
  }
}

/**
 * Get bot history and activity logs
 */
export function getBotHistory() {
  ensureStorage();
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      processedVideos: Array.isArray(parsed.processedVideos) ? parsed.processedVideos : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
    };
  } catch (err) {
    console.warn('[LocalBot] Error reading botHistory.json:', err.message);
    return { processedVideos: [], logs: [] };
  }
}

/**
 * Save history and activity logs
 */
export function saveBotHistory(data) {
  ensureStorage();
  try {
    const payload = {
      processedVideos: Array.isArray(data.processedVideos) ? data.processedVideos : [],
      logs: Array.isArray(data.logs) ? data.logs : [],
    };
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(payload, null, 2));
    return payload;
  } catch (err) {
    console.error('[LocalBot] Error saving botHistory.json:', err);
    throw err;
  }
}

/**
 * Record a bot activity log entry
 */
export function addBotLog({ level = 'info', message = '', details = null }) {
  try {
    const history = getBotHistory();
    const newLog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level, // 'info' | 'warn' | 'error' | 'success'
      message,
      details,
    };
    history.logs.unshift(newLog);
    if (history.logs.length > 150) {
      history.logs = history.logs.slice(0, 150);
    }
    saveBotHistory(history);
    return newLog;
  } catch (err) {
    console.warn('[LocalBot] Error recording log:', err.message);
    return null;
  }
}

/**
 * Decode XML and HTML character references & CDATA
 */
export function decodeXmlEntities(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .trim();
}

/**
 * Universal YouTube Video ID Extractor
 */
export function extractYouTubeVideoId(urlOrId) {
  if (!urlOrId || typeof urlOrId !== 'string') return null;
  const str = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;

  // youtu.be/<id>
  const shortMatch = str.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  // youtube.com/shorts/<id>
  const shortsMatch = str.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];

  // youtube.com/watch?v=<id> or embed/<id> or v/<id>
  const watchMatch = str.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];

  const embedMatch = str.match(/youtube\.com\/(?:embed|v)\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];

  return null;
}

/**
 * Check if a YouTube video ID has already been processed
 */
export function isProcessed(videoId) {
  if (!videoId) return false;
  const history = getBotHistory();
  const record = history.processedVideos.find((v) => v.videoId === videoId);
  if (!record) return false;
  if (record.status === 'success') return true;
  if (record.status === 'skipped') return true;
  if (record.status === 'failed' && (record.attempts || 1) >= 3) return true;
  return false;
}

/**
 * Record a processed video in history
 */
export function addProcessedVideo(videoRecord) {
  try {
    const history = getBotHistory();
    const existingIndex = history.processedVideos.findIndex((v) => v.videoId === videoRecord.videoId);
    const existing = existingIndex >= 0 ? history.processedVideos[existingIndex] : null;

    const attempts = videoRecord.status === 'failed'
      ? ((existing?.attempts || 0) + 1)
      : (videoRecord.attempts || existing?.attempts || 1);

    const record = {
      id: videoRecord.id || existing?.id || crypto.randomUUID(),
      videoId: videoRecord.videoId,
      videoTitle: videoRecord.videoTitle || existing?.videoTitle || 'Untitled Video',
      videoUrl: videoRecord.videoUrl || existing?.videoUrl || `https://www.youtube.com/watch?v=${videoRecord.videoId}`,
      channelName: videoRecord.channelName || existing?.channelName || 'YouTube',
      publishedAt: videoRecord.publishedAt || existing?.publishedAt || new Date().toISOString(),
      processedAt: videoRecord.processedAt || new Date().toISOString(),
      status: videoRecord.status || 'success', // 'success' | 'failed' | 'skipped'
      attempts,
      clipCount: videoRecord.clipCount || (Array.isArray(videoRecord.clips) ? videoRecord.clips.length : 0),
      clips: Array.isArray(videoRecord.clips) ? videoRecord.clips : (existing?.clips || []),
      exportFolder: videoRecord.exportFolder || existing?.exportFolder || null,
      error: videoRecord.error || null,
    };

    if (existingIndex >= 0) {
      history.processedVideos[existingIndex] = record;
    } else {
      history.processedVideos.unshift(record);
    }

    if (history.processedVideos.length > 200) {
      history.processedVideos = history.processedVideos.slice(0, 200);
    }

    saveBotHistory(history);
    return record;
  } catch (err) {
    console.warn('[LocalBot] Error adding processed video:', err.message);
    return null;
  }
}

/**
 * Clear bot history and logs
 */
export function clearBotHistory() {
  const payload = { processedVideos: [], logs: [] };
  saveBotHistory(payload);
  addBotLog({ level: 'info', message: 'Bot history and activity logs cleared.' });
  return payload;
}

/**
 * Parse YouTube RSS Atom XML feed into structured video objects
 */
export function parseYouTubeRssFeed(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') return { channel: {}, videos: [] };

  const channelIdMatch = xmlString.match(/<yt:channelId>(.*?)<\/yt:channelId>/);
  const channelTitleMatch = xmlString.match(/<title>(.*?)<\/title>/);
  const channelAuthorMatch = xmlString.match(/<author>\s*<name>(.*?)<\/name>/);

  const rawChannelName = channelAuthorMatch ? channelAuthorMatch[1] : channelTitleMatch ? channelTitleMatch[1] : 'YouTube Channel';
  const channelInfo = {
    channelId: channelIdMatch ? channelIdMatch[1].trim() : '',
    channelName: decodeXmlEntities(rawChannelName),
  };

  // Robust splitting on <entry> tags with or without namespace/attributes
  const entries = xmlString.split(/<entry[\s>]/i);
  entries.shift(); // Remove feed header before first <entry>

  const videos = [];
  for (const entry of entries) {
    const videoIdMatch = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/i);
    const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const publishedMatch = entry.match(/<published>(.*?)<\/published>/i);
    const updatedMatch = entry.match(/<updated>(.*?)<\/updated>/i);
    const descMatch = entry.match(/<media:description>([\s\S]*?)<\/media:description>/i);
    const thumbMatch = entry.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);

    if (videoIdMatch && videoIdMatch[1]) {
      const videoId = videoIdMatch[1].trim();
      const rawTitle = titleMatch ? titleMatch[1] : `Video ${videoId}`;
      const title = decodeXmlEntities(rawTitle);
      const description = descMatch ? decodeXmlEntities(descMatch[1]) : '';
      const thumbnail = thumbMatch ? thumbMatch[1] : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      videos.push({
        videoId,
        title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt: publishedMatch ? publishedMatch[1].trim() : new Date().toISOString(),
        updatedAt: updatedMatch ? updatedMatch[1].trim() : null,
        description,
        thumbnail,
      });
    }
  }

  return {
    channel: channelInfo,
    videos,
  };
}

/**
 * Resolve channel information and recent videos from URL, Handle, or Channel ID
 */
export async function resolveChannelInfo(identifier) {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('Channel URL, Handle, or ID is required.');
  }

  let cleanInput = identifier.trim();
  let channelId = null;
  let rssUrl = null;
  let resolvedChannelName = '';

  // Standardize domain prefixes
  if (cleanInput.startsWith('youtube.com') || cleanInput.startsWith('www.youtube.com')) {
    cleanInput = `https://${cleanInput}`;
  }

  // 1. Check if directly a Channel ID (UC...)
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(cleanInput)) {
    channelId = cleanInput;
    rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  } else if (cleanInput.includes('youtube.com/channel/')) {
    const match = cleanInput.match(/channel\/(UC[a-zA-Z0-9_-]{22})/);
    if (match) {
      channelId = match[1];
      rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    }
  }

  // 2. If it's a handle (@handle) or custom URL or standard YouTube page, fetch page to extract channelId
  if (!channelId) {
    let targetUrl = cleanInput;
    if (cleanInput.startsWith('@')) {
      targetUrl = `https://www.youtube.com/${cleanInput}`;
    } else if (!cleanInput.startsWith('http://') && !cleanInput.startsWith('https://')) {
      targetUrl = `https://www.youtube.com/@${cleanInput}`;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const html = await res.text();
        const idMatches = [
          html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})"/),
          html.match(/<meta itemprop="identifier" content="(UC[a-zA-Z0-9_-]{22})"/),
          html.match(/itemprop="channelId" content="(UC[a-zA-Z0-9_-]{22})"/),
          html.match(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/),
          html.match(/"externalChannelId":"(UC[a-zA-Z0-9_-]{22})"/),
          html.match(/"browseId":"(UC[a-zA-Z0-9_-]{22})"/),
          html.match(/"externalId":"(UC[a-zA-Z0-9_-]{22})"/),
          html.match(/href="https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?channel_id=(UC[a-zA-Z0-9_-]{22})"/),
        ];

        for (const m of idMatches) {
          if (m && m[1]) {
            channelId = m[1];
            rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
            break;
          }
        }

        const titleMatch = html.match(/<meta property="og:title" content="(.*?)"/);
        if (titleMatch && titleMatch[1]) {
          resolvedChannelName = decodeXmlEntities(titleMatch[1]);
        }
      }
    } catch (fetchErr) {
      console.warn('[LocalBot] Channel HTML fetch warning:', fetchErr.message);
    }
  }

  // 3. Attempt RSS fetch if channelId was resolved
  if (rssUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(rssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArloClipper/1.0',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const xml = await res.text();
        const parsed = parseYouTubeRssFeed(xml);
        if (parsed.videos && parsed.videos.length > 0) {
          return {
            success: true,
            channelId: channelId || parsed.channel.channelId,
            channelName: resolvedChannelName || parsed.channel.channelName || 'YouTube Channel',
            channelUrl: `https://www.youtube.com/channel/${channelId || parsed.channel.channelId}`,
            rssUrl,
            videos: parsed.videos,
          };
        }
      }
    } catch (rssErr) {
      console.warn('[LocalBot] RSS fetch warning:', rssErr.message);
    }
  }

  // 4. Fallback to yt-dlp flat playlist extraction
  let targetUrl = cleanInput;
  if (cleanInput.startsWith('@')) {
    targetUrl = `https://www.youtube.com/${cleanInput}/videos`;
  } else if (!cleanInput.startsWith('http://') && !cleanInput.startsWith('https://')) {
    targetUrl = `https://www.youtube.com/@${cleanInput}/videos`;
  }

  try {
    const meta = await youtubedl(targetUrl, {
      dumpSingleJson: true,
      flatPlaylist: true,
      playlistEnd: 10,
      noWarnings: true,
      noCheckCertificates: true,
    });

    if (meta && (meta.entries || meta.title)) {
      const entries = Array.isArray(meta.entries) ? meta.entries : [];
      const videos = entries.map((e) => ({
        videoId: e.id || (e.url ? e.url.replace(/.*v=/, '') : ''),
        title: decodeXmlEntities(e.title || 'Untitled Video'),
        url: e.url || (e.id ? `https://www.youtube.com/watch?v=${e.id}` : targetUrl),
        publishedAt: e.upload_date ? `${e.upload_date.slice(0, 4)}-${e.upload_date.slice(4, 6)}-${e.upload_date.slice(6, 8)}T00:00:00Z` : new Date().toISOString(),
        description: e.description || '',
        thumbnail: e.thumbnails && e.thumbnails[0] ? e.thumbnails[0].url : `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`,
      }));

      const resolvedChId = meta.channel_id || meta.uploader_id || channelId || '';

      // If flat playlist returned 0 entries but gave us channel_id, attempt RSS fetch
      if (videos.length === 0 && resolvedChId) {
        try {
          const fallbackRss = `https://www.youtube.com/feeds/videos.xml?channel_id=${resolvedChId}`;
          const res = await fetch(fallbackRss, { headers: { 'User-Agent': 'ArloClipper/1.0' } });
          if (res.ok) {
            const parsed = parseYouTubeRssFeed(await res.text());
            if (parsed.videos && parsed.videos.length > 0) {
              return {
                success: true,
                channelId: resolvedChId,
                channelName: meta.channel || meta.uploader || parsed.channel.channelName || 'YouTube Channel',
                channelUrl: `https://www.youtube.com/channel/${resolvedChId}`,
                rssUrl: fallbackRss,
                videos: parsed.videos,
              };
            }
          }
        } catch {
          // ignore
        }
      }

      return {
        success: true,
        channelId: resolvedChId,
        channelName: meta.channel || meta.uploader || resolvedChannelName || 'YouTube Channel',
        channelUrl: meta.channel_url || targetUrl,
        rssUrl: resolvedChId ? `https://www.youtube.com/feeds/videos.xml?channel_id=${resolvedChId}` : null,
        videos,
      };
    }
  } catch (ytdlErr) {
    console.warn('[LocalBot] yt-dlp fallback warning:', ytdlErr.message);
  }

  throw new Error(`Failed to resolve YouTube channel for '${cleanInput}'. Please check URL or Channel ID.`);
}

/**
 * Fetch latest videos from configured channel
 */
export async function fetchChannelVideos(channelIdentifier) {
  const result = await resolveChannelInfo(channelIdentifier);
  return result.videos || [];
}

/**
 * Generate TXT and JSON social media metadata files for exported clips
 */
export function generateClipMetadataFiles({
  clip,
  sourceVideo,
  exportFolder,
  clipIndex = 1,
}) {
  try {
    if (!fs.existsSync(exportFolder)) {
      fs.mkdirSync(exportFolder, { recursive: true });
    }

    const safeTitle = (clip.title || `clip_${clipIndex}`)
      .replace(/[^a-zA-Z0-9_\-\s]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 50);

    const baseName = `clip_${clipIndex}_${safeTitle}`;
    const txtPath = path.join(exportFolder, `${baseName}_metadata.txt`);
    const jsonPath = path.join(exportFolder, `${baseName}_metadata.json`);

    const copies = getAllCopies(clip);
    const hashtagsFormatted = formatHashtags(clip.hashtags || ['#Shorts', '#Viral', '#Trending']);
    const timeRange = formatTimestamp(clip.startTime, clip.endTime);

    // Human-readable TXT formatting
    const txtContent = `=======================================================
ARLO CLIPPER - AUTOMATED SOCIAL MEDIA METADATA
=======================================================
Clip Title     : ${clip.title || 'Untitled Clip'}
Source Channel : ${clip.channelName || sourceVideo.channelName || 'YouTube'}
Source Video   : ${sourceVideo.videoTitle || sourceVideo.title || ''}
Source URL     : ${sourceVideo.videoUrl || sourceVideo.url || ''}
Timestamp      : ${timeRange || 'Full Clip'} (Duration: ${Math.round(clip.duration || 0)}s)
Viral Hook     : ${clip.hook || 'N/A'}
Caption        : ${clip.caption || 'N/A'}
Hashtags       : ${hashtagsFormatted}
Exported Date  : ${new Date().toLocaleString()}

=======================================================
🔴 YOUTUBE SHORTS COPY (Ready to Paste)
=======================================================
${copies.youtube}

=======================================================
📸 INSTAGRAM REELS COPY (Ready to Paste)
=======================================================
${copies.instagram}

=======================================================
🎵 TIKTOK COPY (Ready to Paste)
=======================================================
${copies.tiktok}
=======================================================
`;

    fs.writeFileSync(txtPath, txtContent, 'utf-8');

    // Structured JSON metadata
    const jsonPayload = {
      clipId: clip.id || clip.clipId,
      clipIndex,
      title: clip.title,
      hook: clip.hook,
      caption: clip.caption,
      channelName: clip.channelName || sourceVideo.channelName,
      sourceVideoTitle: sourceVideo.videoTitle || sourceVideo.title,
      sourceVideoUrl: sourceVideo.videoUrl || sourceVideo.url,
      sourceVideoId: sourceVideo.videoId,
      startTime: clip.startTime,
      endTime: clip.endTime,
      duration: clip.duration,
      hashtags: clip.hashtags || ['#Shorts', '#Viral', '#Trending'],
      copies,
      videoPublicUrl: clip.videoUrl || clip.videoPath,
      txtMetadataFile: path.basename(txtPath),
      exportedAt: new Date().toISOString(),
    };

    fs.writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2), 'utf-8');

    return {
      txtPath,
      jsonPath,
      baseName,
      copies,
    };
  } catch (err) {
    console.error('[LocalBot] Failed to generate metadata files:', err);
    return null;
  }
}

/**
 * Export MP4 clips and metadata files to dedicated export directory
 */
export async function exportBotClipFiles({
  clips = [],
  sourceVideo = {},
  exportDirName = 'exports',
}) {
  const projectRoot = process.cwd();
  const baseExportDir = path.isAbsolute(exportDirName)
    ? exportDirName
    : path.join(projectRoot, exportDirName);

  const now = new Date();
  const dateFolder = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const safeVideoTitle = (sourceVideo.videoTitle || sourceVideo.title || sourceVideo.videoId || 'clip')
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 40) || 'video';

  const targetFolder = path.join(baseExportDir, `${dateFolder}_${safeVideoTitle}`);
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  const exportedClips = [];

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const clipIndex = i + 1;
    const safeClipTitle = (clip.title || `clip_${clipIndex}`)
      .replace(/[^a-zA-Z0-9_\-\s]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 40) || `clip_${clipIndex}`;

    const targetMp4Name = `clip_${clipIndex}_${safeClipTitle}.mp4`;
    const targetMp4Path = path.join(targetFolder, targetMp4Name);

    // Multi-candidate source MP4 path resolution
    const rawPublicPath = clip.videoUrl || clip.videoPath || '';
    const cleanPublicName = path.basename(rawPublicPath);
    const candidatePaths = [
      clip.videoPath,
      path.join(projectRoot, 'public', 'clips', cleanPublicName),
      path.join(projectRoot, 'public', cleanPublicName),
      rawPublicPath,
    ].filter(Boolean);

    let sourceFound = null;
    for (const p of candidatePaths) {
      if (typeof p === 'string' && fs.existsSync(p)) {
        sourceFound = p;
        break;
      }
    }

    if (sourceFound) {
      try {
        fs.copyFileSync(sourceFound, targetMp4Path);
      } catch (cpErr) {
        console.warn(`[LocalBot] Failed to copy clip MP4 to export dir:`, cpErr.message);
      }
    }

    const metaResult = generateClipMetadataFiles({
      clip,
      sourceVideo,
      exportFolder: targetFolder,
      clipIndex,
    });

    exportedClips.push({
      ...clip,
      exportedMp4Path: targetMp4Path,
      exportedTxtPath: metaResult?.txtPath || null,
      exportedJsonPath: metaResult?.jsonPath || null,
      copies: metaResult?.copies || getAllCopies(clip),
    });
  }

  // Generate batch summary in export folder
  const summaryPath = path.join(targetFolder, 'summary.json');
  try {
    fs.writeFileSync(
      summaryPath,
      JSON.stringify(
        {
          sourceVideo,
          totalClips: exportedClips.length,
          exportFolder: targetFolder,
          exportedAt: new Date().toISOString(),
          clips: exportedClips.map((c) => ({
            title: c.title,
            hook: c.hook,
            duration: c.duration,
            mp4: path.basename(c.exportedMp4Path || ''),
            txt: path.basename(c.exportedTxtPath || ''),
            json: path.basename(c.exportedJsonPath || ''),
          })),
        },
        null,
        2
      )
    );
  } catch (sumErr) {
    console.warn('[LocalBot] Summary file write warning:', sumErr.message);
  }

  return {
    exportFolder: targetFolder,
    exportedClips,
  };
}

/**
 * Main Check & Process Engine: Inspect channel, identify new videos, and run pipeline
 */
let isCheckingLock = false;

export async function checkAndProcessNewVideos(options = {}) {
  const { isManual = false, forceVideoUrl = null, localInputPath = null } = options;

  if (isCheckingLock) {
    const msg = 'Bot check is already running in background. Please wait for current run to finish.';
    console.log(`[LocalBot] ${msg}`);
    return { success: false, message: msg, alreadyRunning: true };
  }

  isCheckingLock = true;
  const startTime = Date.now();
  const config = getBotConfig();

  try {
    addBotLog({
      level: 'info',
      message: isManual ? '⚡ Manual bot check triggered.' : '⏰ Scheduled bot check started.',
      details: { channelUrl: config.channelUrl, channelName: config.channelName },
    });

    let newVideosToProcess = [];

    // Mode A: Direct URL or Local File override (e.g. testing / direct trigger)
    if (localInputPath || forceVideoUrl) {
      const vId = forceVideoUrl ? (extractYouTubeVideoId(forceVideoUrl) || `custom_${Date.now()}`) : `local_${Date.now()}`;
      newVideosToProcess.push({
        videoId: vId,
        title: forceVideoUrl ? 'Custom Video Job' : path.basename(localInputPath),
        url: forceVideoUrl || '',
        localInputPath: localInputPath || null,
        channelName: config.channelName || 'Local Source',
        publishedAt: new Date().toISOString(),
      });
    } else {
      // Mode B: Standard Channel Watcher
      if (!config.channelUrl && !config.channelId) {
        throw new Error('No target channel configured. Please set Channel URL or ID in Bot settings.');
      }

      const targetIdentifier = config.channelUrl || config.channelId;
      console.log(`[LocalBot] Polling channel: ${targetIdentifier}...`);

      const channelData = await resolveChannelInfo(targetIdentifier);
      const recentVideos = channelData.videos || [];

      // Update channel metadata in config without restarting scheduler interval
      if (channelData.channelName && channelData.channelName !== config.channelName) {
        saveBotConfig({ channelName: channelData.channelName, channelId: channelData.channelId }, { restartScheduler: false });
      }

      console.log(`[LocalBot] Found ${recentVideos.length} recent video(s) on ${channelData.channelName}. Checking history...`);

      // Filter out videos that have already been processed
      for (const video of recentVideos) {
        if (!isProcessed(video.videoId)) {
          newVideosToProcess.push({
            ...video,
            channelName: channelData.channelName,
          });
        }
      }

      const maxToProcess = Math.max(1, config.maxVideosPerCheck || 1);
      if (newVideosToProcess.length > maxToProcess) {
        console.log(`[LocalBot] Limiting new videos to process from ${newVideosToProcess.length} to ${maxToProcess}`);
        newVideosToProcess = newVideosToProcess.slice(0, maxToProcess);
      }
    }

    if (newVideosToProcess.length === 0) {
      const durationMs = Date.now() - startTime;
      const msg = 'Check completed: No new unprocessed videos found.';
      console.log(`[LocalBot] ${msg}`);

      const now = new Date();
      const nextCheck = new Date(now.getTime() + (config.checkIntervalMinutes || 60) * 60 * 1000);
      saveBotConfig({ lastCheckedAt: now.toISOString(), nextCheckAt: nextCheck.toISOString() }, { restartScheduler: false });

      addBotLog({
        level: 'info',
        message: msg,
        details: { durationMs, channel: config.channelName },
      });

      return {
        success: true,
        processedCount: 0,
        message: msg,
        durationMs,
      };
    }

    console.log(`[LocalBot] 🚀 Found ${newVideosToProcess.length} new video(s) to process!`);
    const processedResults = [];

    for (const targetVideo of newVideosToProcess) {
      console.log(`[LocalBot] Processing new video: "${targetVideo.title}" (${targetVideo.videoId})...`);
      addBotLog({
        level: 'info',
        message: `Processing video: "${targetVideo.title}"`,
        details: { videoId: targetVideo.videoId, url: targetVideo.url },
      });

      try {
        const pipelineResult = await processWebhookVideoJob({
          url: targetVideo.url,
          localInputPath: targetVideo.localInputPath,
          ratio: config.preset.ratio || '9:16',
          faceTracking: config.preset.faceTracking || false,
          splitScreen: config.preset.splitScreen || false,
          subtitles: config.preset.subtitles !== false,
          subtitleAnimation: config.preset.subtitleAnimation || 'Pop',
          font: config.preset.font || 'Impact',
          fontSize: config.preset.fontSize || 'Medium',
          color: config.preset.color || '#FFFF00',
          broll: config.preset.broll ?? 'auto',
          bgm: config.preset.bgm || 'upbeat-energetic',
          ducking: config.preset.ducking || 'medium',
          sfx: config.preset.sfx !== false,
          maxClips: config.maxClipsPerVideo || 3,
        });

        let exportResult = null;
        if (config.exportSettings.autoExport && Array.isArray(pipelineResult.clips) && pipelineResult.clips.length > 0) {
          exportResult = await exportBotClipFiles({
            clips: pipelineResult.clips,
            sourceVideo: targetVideo,
            exportDirName: config.exportSettings.exportDir || 'exports',
          });
        }

        let finalClips = exportResult ? exportResult.exportedClips : pipelineResult.clips || [];

        // Auto-Publish to configured social platforms if enabled
        if (config.autoPublish?.enabled && finalClips.length > 0) {
          const pubPlatforms = Array.isArray(config.autoPublish.platforms) && config.autoPublish.platforms.length > 0
            ? config.autoPublish.platforms
            : ['youtube'];
          const pubPrivacy = config.autoPublish.privacy || 'public';

          console.log(`[LocalBot AutoPublish] 🚀 Auto-publishing ${finalClips.length} clip(s) to [${pubPlatforms.join(', ')}]...`);

          const updatedClips = [];
          for (const c of finalClips) {
            try {
              const pubRes = await publishToMultiplePlatforms({
                clipId: c.id || c.clipId,
                clip: c,
                filePath: c.exportedMp4Path || c.videoPath || c.videoUrl,
                platforms: pubPlatforms,
                privacy: pubPrivacy,
              });
              updatedClips.push({
                ...c,
                publishResults: pubRes.results,
                publishStatus: pubRes.status,
              });
            } catch (pubErr) {
              console.warn(`[LocalBot AutoPublish] Failed to publish clip ${c.id}:`, pubErr.message);
              updatedClips.push({
                ...c,
                publishStatus: 'failed',
                publishError: pubErr.message,
              });
            }
          }
          finalClips = updatedClips;
        }

        const record = addProcessedVideo({
          videoId: targetVideo.videoId,
          videoTitle: targetVideo.title,
          videoUrl: targetVideo.url,
          channelName: targetVideo.channelName,
          publishedAt: targetVideo.publishedAt,
          processedAt: new Date().toISOString(),
          status: 'success',
          clipCount: pipelineResult.clips ? pipelineResult.clips.length : 0,
          clips: finalClips,
          exportFolder: exportResult ? exportResult.exportFolder : null,
        });

        processedResults.push(record);

        addBotLog({
          level: 'success',
          message: `Successfully processed "${targetVideo.title}" → Generated ${record.clipCount} clips & social metadata.${config.autoPublish?.enabled ? ' (Auto-published to medsos)' : ''}`,
          details: {
            videoId: targetVideo.videoId,
            clipCount: record.clipCount,
            exportFolder: record.exportFolder,
            autoPublish: config.autoPublish?.enabled ? config.autoPublish : false,
          },
        });
      } catch (videoError) {
        console.error(`[LocalBot] Failed to process video ${targetVideo.videoId}:`, videoError);

        const failRecord = addProcessedVideo({
          videoId: targetVideo.videoId,
          videoTitle: targetVideo.title,
          videoUrl: targetVideo.url,
          channelName: targetVideo.channelName,
          publishedAt: targetVideo.publishedAt,
          processedAt: new Date().toISOString(),
          status: 'failed',
          clipCount: 0,
          clips: [],
          error: videoError.message,
        });

        processedResults.push(failRecord);

        addBotLog({
          level: 'error',
          message: `Failed to process video "${targetVideo.title}": ${videoError.message}`,
          details: { videoId: targetVideo.videoId, error: videoError.message },
        });
      }
    }

    const totalDurationMs = Date.now() - startTime;
    const now = new Date();
    const nextCheck = new Date(now.getTime() + (config.checkIntervalMinutes || 60) * 60 * 1000);
    saveBotConfig({ lastCheckedAt: now.toISOString(), nextCheckAt: nextCheck.toISOString() }, { restartScheduler: false });

    console.log(`[LocalBot] Finished processing batch in ${totalDurationMs}ms.`);
    return {
      success: true,
      processedCount: processedResults.length,
      results: processedResults,
      totalDurationMs,
    };
  } catch (error) {
    console.error('[LocalBot] Critical error during bot check cycle:', error);
    addBotLog({
      level: 'error',
      message: `Bot check cycle encountered an error: ${error.message}`,
      details: { error: error.message },
    });
    return {
      success: false,
      error: error.message,
    };
  } finally {
    isCheckingLock = false;
  }
}

/**
 * In-process Scheduler Engine (Survives Next.js hot reloads via globalThis)
 */
export function startBotScheduler() {
  const config = getBotConfig();
  if (!config.enabled) {
    stopBotScheduler();
    return false;
  }

  // Clear existing timer if any
  if (globalThis.__arloBotInterval) {
    clearInterval(globalThis.__arloBotInterval);
    globalThis.__arloBotInterval = null;
  }

  const intervalMinutes = Math.max(5, Number(config.checkIntervalMinutes) || 60);
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(`[LocalBot Scheduler] Starting polling scheduler every ${intervalMinutes} minute(s)...`);

  globalThis.__arloBotInterval = setInterval(async () => {
    try {
      const currentConfig = getBotConfig();
      if (currentConfig.enabled) {
        console.log('[LocalBot Scheduler] Executing scheduled channel poll...');
        await checkAndProcessNewVideos({ isManual: false });
      } else {
        stopBotScheduler();
      }
    } catch (schedErr) {
      console.error('[LocalBot Scheduler] Scheduled tick error:', schedErr);
    }
  }, intervalMs);

  return true;
}

export function stopBotScheduler() {
  if (globalThis.__arloBotInterval) {
    clearInterval(globalThis.__arloBotInterval);
    globalThis.__arloBotInterval = null;
    console.log('[LocalBot Scheduler] Scheduler stopped.');
  }
  return true;
}

export function getSchedulerStatus() {
  const config = getBotConfig();
  if (config.enabled && !globalThis.__arloBotInterval) {
    startBotScheduler();
  }
  return {
    isRunning: Boolean(globalThis.__arloBotInterval) && config.enabled,
    isChecking: isCheckingLock,
    config,
  };
}
