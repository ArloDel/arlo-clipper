'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './dashboard.module.css';

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const url = searchParams.get('url');
  const ratio = searchParams.get('ratio') || 'mobile';
  
  const [status, setStatus] = useState('initializing'); // initializing, downloading, complete, error
  const [clips, setClips] = useState([]);

  useEffect(() => {
    if (!url) {
      router.push('/');
      return;
    }

    const runPipeline = async () => {
      setStatus('downloading');
      
      try {
        const res = await fetch('/api/clip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, ratio })
        });
        
        const data = await res.json();
        
        if (data.success) {
          setClips(data.clips);
          setStatus('complete');
        } else {
          console.error(data.error);
          setStatus('error');
        }
      } catch (err) {
        console.error(err);
        setStatus('error');
      }
    };

    runPipeline();
  }, [url, router]);

  const renderStatus = () => {
    const messages = {
      downloading: 'AI Pipeline Active: Downloading -> Gemini Analysis -> FFMPEG Slicing -> Groq Auto Subtitles -> FFMPEG Burn-in. (Takes ~2-4 minutes)',
      error: 'Failed to process video. Please check terminal logs.'
    };

    return (
      <div className={styles.processingCard}>
        {status !== 'error' && <div className={styles.spinner}></div>}
        <h2 className={styles.statusText}>{status === 'error' ? 'Error' : 'Processing Video'}</h2>
        <p className={styles.statusSub}>{messages[status] || 'Preparing...'}</p>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href="/" className={styles.logo}>Clipify</Link>
        <div className="btn btn-secondary">Profile</div>
      </header>

      {status !== 'complete' ? renderStatus() : (
        <div>
          <h2 style={{ marginBottom: 'var(--space-6)' }}>Generated Clips</h2>
          <div className={styles.resultsGrid}>
            {clips.map(clip => (
              <div key={clip.id} className={styles.clipCard}>
                <div className={styles.videoPlaceholder}>
                  <video src={clip.src} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div className={styles.clipInfo}>
                  <div className={styles.clipTitle}>{clip.title}</div>
                  <div className={styles.clipMetrics}>
                    <span>⏱ {clip.duration}</span>
                    <span className={styles.badge}>Viral Score: {clip.score}</span>
                  </div>
                  <div className={styles.actions}>
                    <button className="btn btn-secondary">Edit</button>
                    <a href={clip.src} download className="btn btn-primary" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Download</a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
