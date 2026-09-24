/**
 * @fileoverview Social Copy Generator & Template Engine for Arlo Clipper.
 * Generates platform-optimized viral hooks, timestamps, channel attributions,
 * captions, and curated hashtag packages for YouTube Shorts, Instagram Reels, and TikTok.
 * @module lib/socialCopy
 */

/**
 * Normalizes and formats an array or string of tags with leading '#' symbols.
 *
 * @param {string[]|string} tags - Raw hashtag array or delimited string
 * @returns {string} Space-delimited formatted hashtag string (e.g. "#Shorts #Viral #Tech")
 * @example
 * formatHashtags(['Shorts', '#Viral', 'AI']); // => '#Shorts #Viral #AI'
 */
export function formatHashtags(tags) {
  if (!tags) return '';
  if (Array.isArray(tags)) {
    return tags
      .map((t) => (t.startsWith('#') ? t : `#${t}`))
      .join(' ');
  }
  return String(tags);
}

/**
 * Formats start and end timestamps into a clean clip range string.
 *
 * @param {string|number} [startTime] - Clip start time
 * @param {string|number} [endTime] - Clip end time
 * @returns {string} Formatted range string (e.g. "00:01:15 - 00:01:45")
 */
export function formatTimestamp(startTime, endTime) {
  if (!startTime) return '';
  if (!endTime) return String(startTime);
  return `${startTime} - ${endTime}`;
}

/**
 * Clip copy metadata payload.
 * @typedef {Object} ClipCopyInput
 * @property {string} [title] - Video title
 * @property {string} [hook] - Opening punchline hook
 * @property {string} [caption] - Explanatory caption text
 * @property {string} [channelName] - Creator/channel attribution name
 * @property {string|number} [startTime] - Start timestamp
 * @property {string|number} [endTime] - End timestamp
 * @property {string[]|string} [hashtags] - Custom hashtags
 */

/**
 * Generates copy and description tailored for YouTube Shorts.
 * Includes title, hook, caption, channel credit, clip timestamp, and #Shorts tags.
 *
 * @param {ClipCopyInput} clip - Clip information
 * @returns {string} Ready-to-paste YouTube Shorts description
 */
export function getYouTubeCopy(clip = {}) {
  const title = clip.title || clip.hook || 'Untitled Clip';
  const hook = clip.hook ? `🔥 ${clip.hook}\n\n` : '';
  const caption = clip.caption || '';
  const timeStr = formatTimestamp(clip.startTime || clip.start_time, clip.endTime || clip.end_time);
  const channel = clip.channelName || 'Source';
  
  const customTags = Array.isArray(clip.hashtags) ? clip.hashtags : (clip.hashtags ? [clip.hashtags] : []);
  const mergedTags = Array.from(new Set([...customTags, '#Shorts', '#YouTubeShorts', '#Viral']));
  const hashtags = formatHashtags(mergedTags);

  let copy = `${title}\n\n`;
  if (hook && hook.trim() !== title.trim()) {
    copy += hook;
  }
  if (caption) {
    copy += `${caption}\n\n`;
  }
  if (timeStr || channel) {
    copy += `📍 Source: ${channel} ${timeStr ? `(Clip: ${timeStr})` : ''}\n\n`;
  }
  copy += `${hashtags}`;
  return copy.trim();
}

/**
 * Generates copy and caption tailored for Instagram Reels.
 * Includes hook, line breaks, creator tag attribution, and #Reels tags.
 *
 * @param {ClipCopyInput} clip - Clip information
 * @returns {string} Ready-to-paste Instagram Reels caption
 */
export function getInstagramCopy(clip = {}) {
  const hook = clip.hook || clip.title || '';
  const caption = clip.caption || '';
  const timeStr = formatTimestamp(clip.startTime || clip.start_time, clip.endTime || clip.end_time);
  const channel = clip.channelName || 'Source';
  
  const customTags = Array.isArray(clip.hashtags) ? clip.hashtags : (clip.hashtags ? [clip.hashtags] : []);
  const mergedTags = Array.from(new Set([...customTags, '#Reels', '#ReelsInstagram', '#ViralReels', '#ExplorePage']));
  const hashtags = formatHashtags(mergedTags);

  let copy = '';
  if (hook) {
    copy += `${hook}\n\n`;
  }
  if (caption) {
    copy += `${caption}\n\n`;
  }
  copy += `.\n.\n🎥 Credit: @${channel.replace(/\s+/g, '')} ${timeStr ? `| ⏱️ ${timeStr}` : ''}\n\n`;
  copy += `${hashtags}`;
  return copy.trim();
}

/**
 * Generates copy and caption tailored for TikTok.
 * Includes emoji punchlines, channel cc, and #fyp trending tags.
 *
 * @param {ClipCopyInput} clip - Clip information
 * @returns {string} Ready-to-paste TikTok caption
 */
export function getTikTokCopy(clip = {}) {
  const hook = clip.hook || clip.title || '';
  const caption = clip.caption || '';
  const channel = clip.channelName || 'Source';
  
  const customTags = Array.isArray(clip.hashtags) ? clip.hashtags : (clip.hashtags ? [clip.hashtags] : []);
  const mergedTags = Array.from(new Set([...customTags, '#fyp', '#foryou', '#viral', '#trending']));
  const hashtags = formatHashtags(mergedTags);

  let copy = '';
  if (hook) {
    copy += `${hook} 😱\n\n`;
  }
  if (caption) {
    copy += `${caption}\n\n`;
  }
  copy += `cc: ${channel}\n\n${hashtags}`;
  return copy.trim();
}

/**
 * Generates tailored copy packages for all 3 major short-form video platforms simultaneously.
 *
 * @param {ClipCopyInput} clip - Clip information
 * @returns {{youtube: string, instagram: string, tiktok: string}} Platform copies
 */
export function getAllCopies(clip = {}) {
  return {
    youtube: getYouTubeCopy(clip),
    instagram: getInstagramCopy(clip),
    tiktok: getTikTokCopy(clip),
  };
}
