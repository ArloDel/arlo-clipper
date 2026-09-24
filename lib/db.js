/**
 * @fileoverview Local JSON Database Manager for Arlo Clipper.
 * Handles persistence, pagination, multi-platform publishing status mapping,
 * virality score enrichment, and CRUD operations for video clips.
 * @module lib/db
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getClipPublishStatus, getPublishHistory } from './socialPublishers.js';
import { calculateViralityScore } from './viralityScore.js';

const dbPath = path.join(process.cwd(), 'data', 'db.json');

/**
 * Initializes data directory and db.json database file if missing.
 * @private
 */
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

/**
 * Raw database schema structure.
 * @typedef {Object} DbSchema
 * @property {ClipRecord[]} clips - Stored video clips
 */

/**
 * Video clip record schema.
 * @typedef {Object} ClipRecord
 * @property {string} id - Unique UUID of the clip
 * @property {string} title - Title of the clip
 * @property {string} videoPath - Public relative path to final rendered MP4 (e.g. "/clips/xyz-final.mp4")
 * @property {number} duration - Clip duration in seconds
 * @property {string} hook - Viral opening hook
 * @property {string} caption - Contextual caption
 * @property {string} channelName - Channel or creator attribution
 * @property {string} startTime - Original video start timestamp ("HH:MM:SS")
 * @property {string} endTime - Original video end timestamp ("HH:MM:SS")
 * @property {string[]} hashtags - Array of hashtags
 * @property {Object} viralityScore - Calculated virality score report
 * @property {string} createdAt - ISO 8601 creation timestamp
 */

/**
 * Reads and parses the entire local JSON database.
 *
 * @returns {DbSchema} Parsed database object
 */
export const getDb = () => {
  initDb();
  const data = fs.readFileSync(dbPath, 'utf-8');
  return JSON.parse(data);
};

/**
 * Writes updated database object to db.json on disk.
 *
 * @param {DbSchema} data - Database object to persist
 * @returns {void}
 */
export const saveDb = (data) => {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
};

/**
 * Retrieves all clips sorted descending by creation date, enriched with virality scores.
 *
 * @param {'all'|'published'|'unpublished'|string} [filter='all'] - Publishing status filter
 * @returns {ClipRecord[]} Array of sorted and filtered clip records
 */
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

/**
 * Paginated clip response payload.
 * @typedef {Object} PaginatedClipsResult
 * @property {Array<ClipRecord & {publishStatus: Object}>} clips - Sliced clips for the requested page
 * @property {number} totalPages - Total pages available
 * @property {number} currentPage - Current active page number
 * @property {number} totalClips - Total filtered clips count
 * @property {{all: number, published: number, unpublished: number}} counts - Filter counter breakdown
 */

/**
 * Retrieves paginated clips with publishing metadata and tab counts for the Library view.
 *
 * @param {number} [page=1] - 1-based page index
 * @param {number} [limit=9] - Items per page
 * @param {'all'|'published'|'unpublished'|string} [filter='all'] - Publishing tab filter
 * @returns {PaginatedClipsResult} Paginated clips structure
 */
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

/**
 * Saves a new clip to the database with virality score calculation and automatic timestamps.
 *
 * @param {Partial<ClipRecord>} clipData - Clip metadata to insert
 * @returns {ClipRecord} Newly created clip record
 */
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
    channelName: clipData.channelName || 'Video',
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

/**
 * Deletes a clip from the database by its ID.
 *
 * @param {string} id - Clip UUID
 * @returns {ClipRecord|null} The deleted clip or null if not found
 */
export const deleteClip = (id) => {
  const db = getDb();
  const clipIndex = db.clips.findIndex(c => c.id === id);
  if (clipIndex === -1) return null;
  
  const [deletedClip] = db.clips.splice(clipIndex, 1);
  saveDb(db);
  return deletedClip;
};

/**
 * Deletes multiple clips from the database in bulk by their IDs.
 *
 * @param {string[]} ids - Array of clip UUIDs
 * @returns {ClipRecord[]} Array of deleted clip records
 */
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
