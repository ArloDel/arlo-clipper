'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '../../components/ThemeToggle';
import styles from './folder.module.css';

export default function FolderPage(props) {
  const params = use(props.params);
  const [clips, setClips] = useState([]);
  const [folderName, setFolderName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const folderRes = await fetch('/api/folders');
        if (folderRes.ok) {
          const foldersData = await folderRes.json();
          const current = foldersData.find((f) => f.id === params.id);
          if (current) setFolderName(current.name);
        }

        const clipsRes = await fetch(`/api/clips?folderId=${params.id}`);
        if (clipsRes.ok) {
          const clipsData = await clipsRes.json();
          setClips(Array.isArray(clipsData) ? clipsData : clipsData.clips || []);
        }
      } catch (err) {
        console.error('Error fetching folder data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [params.id]);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toISOString().split('T')[0];
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerNav}>
          <Link href="/library" className={styles.navLink}>
            ← Library
          </Link>
          <h1 className={styles.title}>{folderName || 'Folder'}</h1>
        </div>
        <div className={styles.headerRight}>
          <ThemeToggle />
        </div>
      </header>

      <main className={styles.main}>
        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <span>Loading folder clips...</span>
          </div>
        ) : (
          <div className={styles.grid}>
            {clips.map((clip) => (
              <div key={clip.id} className={styles.clipCard}>
                <div className={styles.videoWrapper}>
                  <video src={clip.videoPath} controls className={styles.videoPlayer} />
                </div>
                <div className={styles.clipMeta}>
                  <h3 className={styles.clipTitle}>{clip.title || 'Untitled clip'}</h3>
                  <div className={styles.clipStats}>
                    <span className={styles.statBadge}>{formatDuration(clip.duration)}</span>
                    <span>{formatDate(clip.createdAt)}</span>
                  </div>
                  <div className={styles.actions}>
                    <a
                      href={clip.videoPath}
                      download={`${(clip.title || 'clip').replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`}
                      className={styles.downloadBtn}
                      title="Download MP4 Video"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span>Download</span>
                    </a>
                  </div>
                </div>
              </div>
            ))}
            {clips.length === 0 && (
              <div className={styles.emptyState}>
                <p>No clips in this folder yet.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
