'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Text } from '@cloudflare/kumo';
import styles from './library.module.css';

export default function LibraryPage() {
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchClips = async () => {
    try {
      const res = await fetch('/api/clips');
      const data = await res.json();
      setClips(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClips();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to permanently delete this clip?')) {
      return;
    }
    
    try {
      const res = await fetch(`/api/clips/${id}`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        setClips(clips.filter(clip => clip.id !== id));
      } else {
        const err = await res.json();
        alert(`Failed to delete clip: ${err.error}`);
      }
    } catch (err) {
      console.error('Delete error', err);
      alert('An error occurred while deleting the clip.');
    }
  };

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.headerNav}>
          <Link href="/" className={styles.navLink}>← Home</Link>
          <h1 className={styles.title}>My Library</h1>
        </div>
      </header>

      {loading ? (
        <Text>Loading clips...</Text>
      ) : (
        <div className={styles.grid}>
          {clips.map(clip => (
            <div key={clip.id} className={styles.clipCard}>
              <div className={styles.videoWrapper}>
                <video 
                  src={clip.videoPath} 
                  controls 
                  className={styles.videoPreview}
                  preload="metadata"
                />
              </div>
              <div className={styles.clipInfo}>
                <h2 className={styles.clipTitle}>{clip.title}</h2>
                <div className={styles.clipMeta}>
                  <span>{Math.round(clip.duration)}s</span>
                  <span>{new Date(clip.createdAt).toLocaleDateString()}</span>
                </div>
                <div style={{ marginTop: '0.75rem' }}>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={() => handleDelete(clip.id)}
                    style={{ background: 'transparent', color: '#ff4d4d', border: '1px solid #ff4d4d', padding: '0.25rem 0.5rem' }}
                  >
                    Delete Clip
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {clips.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem 0', color: 'var(--kumo-subtle)' }}>
              <Text>No clips generated yet. Go to Home to start extracting.</Text>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
