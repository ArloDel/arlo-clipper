import fs from 'fs';
import path from 'path';

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

export const getAllClips = () => {
  return getDb().clips.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

export const getPaginatedClips = (page = 1, limit = 9) => {
  const allClips = getAllClips();
  const totalClips = allClips.length;
  const totalPages = Math.ceil(totalClips / limit) || 1;
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedClips = allClips.slice(startIndex, endIndex);

  return {
    clips: paginatedClips,
    totalPages,
    currentPage: page,
    totalClips
  };
};

export const saveClip = (clipData) => {
  const db = getDb();
  const newClip = {
    id: clipData.id || crypto.randomUUID(),
    title: clipData.title,
    videoPath: clipData.videoPath,
    duration: clipData.duration,
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
