export function formatHashtags(tags) {
  if (!tags) return '';
  if (Array.isArray(tags)) {
    return tags
      .map((t) => (t.startsWith('#') ? t : `#${t}`))
      .join(' ');
  }
  return String(tags);
}

export function formatTimestamp(startTime, endTime) {
  if (!startTime) return '';
  if (!endTime) return startTime;
  return `${startTime} - ${endTime}`;
}

export function getYouTubeCopy(clip) {
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

export function getInstagramCopy(clip) {
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

export function getTikTokCopy(clip) {
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

export function getAllCopies(clip) {
  return {
    youtube: getYouTubeCopy(clip),
    instagram: getInstagramCopy(clip),
    tiktok: getTikTokCopy(clip),
  };
}
