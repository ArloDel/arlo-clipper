import fs from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'db.json');

const initDb = () => {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ folders: [], clips: [] }, null, 2));
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

export const getFolders = () => {
  return getDb().folders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

export const createFolder = (name) => {
  const db = getDb();
  const newFolder = {
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString()
  };
  db.folders.push(newFolder);
  saveDb(db);
  return newFolder;
};

export const getClipsByFolder = (folderId) => {
  return getDb().clips.filter(c => c.folderId === folderId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

export const saveClip = (clipData) => {
  const db = getDb();
  const newClip = {
    id: clipData.id || crypto.randomUUID(),
    folderId: clipData.folderId || null,
    title: clipData.title,
    videoPath: clipData.videoPath,
    duration: clipData.duration,
    createdAt: new Date().toISOString()
  };
  db.clips.push(newClip);
  saveDb(db);
  return newClip;
};
