import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getClipPublishStatus, getPublishHistory } from './socialPublishers.js';
import { calculateViralityScore } from './viralityScore.js';

const dbPath = path.join(process.cwd(), 'data', 'db.json');

const initDb = () => {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ clips: [] }, null, 2));
  } else {
    // Migrate existing DB if needed
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    if (data.folders) {
      delete data.folders;
      fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    }
  }
};

export const getDb = () => {
  initDb();
  const data = fs.readFileSync(dbPath, 'utf-8');
  return JSON.parse(data);
};

export const saveDb = (data) => {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
};

export const getAllClips = (filter = 'all') => {
  const allClips = getDb().clips.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const clipsWithVirality = allClips.map((clip) => ({
    ...clip,
    viralityScore: clip.viralityScore || calculateViralityScore(clip),
  }));
  if (!filter || filter === 'all') return clipsWithVirality;

  const history = getPublishHistory(200);
  return clipsWithVirality.filter((clip) => {
    const status = getClipPublishStatus(clip, history);
    if (filter === 'published') return status.isPublished;
    if (filter === 'unpublished') return !status.isPublished;
    return true;
  });
};

export const getPaginatedClips = (page = 1, limit = 9, filter = 'all') => {
  const rawClips = getDb().clips.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const allClips = rawClips.map((clip) => ({
    ...clip,
    viralityScore: clip.viralityScore || calculateViralityScore(clip),
  }));
  const history = getPublishHistory(200);

  let publishedCount = 0;
  let unpublishedCount = 0;
  const statusMap = new Map();

  allClips.forEach((c) => {
    const st = getClipPublishStatus(c, history);
    statusMap.set(c.id, st);
    if (st.isPublished) publishedCount++;
    else unpublishedCount++;
  });

  const filteredClips = (filter && filter !== 'all')
    ? allClips.filter((clip) => {
        const st = statusMap.get(clip.id);
        if (filter === 'published') return st?.isPublished;
        if (filter === 'unpublished') return !st?.isPublished;
        return true;
      })
    : allClips;

  const totalClips = filteredClips.length;
  const totalPages = Math.ceil(totalClips / limit) || 1;
  const safePage = Math.max(1, Math.min(page, totalPages));
  const startIndex = (safePage - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedClips = filteredClips.slice(startIndex, endIndex);

  const clipsWithStatus = paginatedClips.map((clip) => ({
    ...clip,
    publishStatus: statusMap.get(clip.id) || getClipPublishStatus(clip, history),
  }));

  return {
    clips: clipsWithStatus,
    totalPages,
    currentPage: safePage,
    totalClips,
    counts: {
      all: allClips.length,
      published: publishedCount,
      unpublished: unpublishedCount,
    },
  };
};


export const saveClip = (clipData) => {
  const db = getDb();
  const viralityScore = clipData.viralityScore || calculateViralityScore(clipData);
  const newClip = {
    id: clipData.id || crypto.randomUUID(),
    title: clipData.title,
    videoPath: clipData.videoPath,
    duration: clipData.duration,
    hook: clipData.hook || clipData.title || '',
    caption: clipData.caption || '',
    channelName: clipData.channelName || 'YouTube',
    startTime: clipData.startTime || clipData.start_time || '',
    endTime: clipData.endTime || clipData.end_time || '',
    hashtags: Array.isArray(clipData.hashtags) ? clipData.hashtags : [],
    viralityScore,
    createdAt: new Date().toISOString()
  };
  db.clips.push(newClip);
  saveDb(db);
  return newClip;
};

export const deleteClip = (id) => {
  const db = getDb();
  const clipIndex = db.clips.findIndex(c => c.id === id);
  if (clipIndex === -1) return null;
  
  const [deletedClip] = db.clips.splice(clipIndex, 1);
  saveDb(db);
  return deletedClip;
};

export const deleteClips = (ids) => {
  const db = getDb();
  const initialLength = db.clips.length;
  const deletedClips = db.clips.filter(c => ids.includes(c.id));
  db.clips = db.clips.filter(c => !ids.includes(c.id));
  
  if (db.clips.length !== initialLength) {
    saveDb(db);
  }
  return deletedClips;
};
