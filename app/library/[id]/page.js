'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Text } from '@cloudflare/kumo';
import styles from './folder.module.css';

export default function FolderPage(props) {
  const params = use(props.params);
  const [clips, setClips] = useState([]);
  const [folderName, setFolderName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const folderRes = await fetch('/api/folders');
      const foldersData = await folderRes.json();
      const current = foldersData.find(f => f.id === params.id);
      if (current) setFolderName(current.name);

      const clipsRes = await fetch(`/api/clips?folderId=${params.id}`);
      const clipsData = await clipsRes.json();
      setClips(clipsData);
      
      setLoading(false);
    };
    fetchData();
  }, [params.id]);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.headerNav}>
          <Link href="/library" className={styles.navLink}>← BACK TO LIBRARY</Link>
          <h1 className={styles.title}>{folderName || 'FOLDER'}</h1>
        </div>
      </header>

      {loading ? (
        <Text>LOADING...</Text>
      ) : (
        <div className={styles.grid}>
          {clips.map(clip => (
            <div key={clip.id} className={styles.clipCard}>
              <video 
                src={clip.videoPath} 
                controls 
                className={styles.videoPlayer}
              />
              <div className={styles.clipMeta}>
                <h3 className={styles.clipTitle}>{clip.title || 'UNTITLED CLIP'}</h3>
                <div className={styles.clipStats}>
                  <span>DUR_{clip.duration}</span>
                  <span>{new Date(clip.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))}
          {clips.length === 0 && <Text>NO CLIPS EXTRACTED YET.</Text>}
        </div>
      )}
    </main>
  );
}
