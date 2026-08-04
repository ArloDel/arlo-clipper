'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';

function EditorialContent() {
  const searchParams = useSearchParams();
  const url = searchParams.get('url');
  
  const initialSubtitles = searchParams.get('subtitles') === 'true';
  const initialFont = searchParams.get('font') || 'Impact';
  const initialSize = searchParams.get('size') || '24';
  const initialColor = searchParams.get('color') || '#FFFF00';
  const ratio = searchParams.get('ratio') || 'mobile';

  const [status, setStatus] = useState('analyzing'); // analyzing, rendering, done
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!url) return;
    
    let isMounted = true;
    
    const processVideo = async () => {
      try {
        setStatus('analyzing');
        
        // 1. Analyze
        const analyzeRes = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        
        if (!analyzeRes.ok) {
          const err = await analyzeRes.json();
          throw new Error(err.error || 'Failed to analyze video');
        }
        
        const analyzeData = await analyzeRes.json();
        const clips = analyzeData.clips;
        
        if (!clips || clips.length === 0) {
          throw new Error('No engaging clips found by the algorithm.');
        }

        if (!isMounted) return;

        // 2. Render all 3 clips automatically
        setStatus('rendering');
        
        const renderRes = await fetch('/api/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            clips,
            ratio,
            subtitles: initialSubtitles,
            font: initialFont,
            size: initialSize,
            color: initialColor
          })
        });

        if (!renderRes.ok) {
          const err = await renderRes.json();
          throw new Error(err.error || 'Failed to render clips');
        }
        
        if (!isMounted) return;
        setStatus('done');
        
      } catch (err) {
        if (!isMounted) return;
        console.error('Processing error:', err);
        setErrorMsg(err.message);
        setStatus('error');
      }
    };
    
    processVideo();
    
    return () => {
      isMounted = false;
    };
  }, [url, initialSubtitles, initialFont, initialSize, initialColor, ratio]);

  // Helper to extract youtube video ID for iframe
  const getVideoId = (urlStr) => {
    try {
      const match = urlStr.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
      return match ? match[1] : '';
    } catch {
      return '';
    }
  };

  const videoId = url ? getVideoId(url) : '';

  return (
    <div className={styles.container}>
      <div className={styles.videoSection}>
        <div className={styles.iframeWrapper}>
          {videoId ? (
            <iframe
              src={`https://www.youtube.com/embed/${videoId}`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          ) : (
            <div style={{ color: 'var(--kumo-subtle)', fontSize: '0.875rem' }}>
              No video URL provided
            </div>
          )}
        </div>
      </div>

      <div className={styles.sidebar}>
        <h1 className={styles.title}>Processing Pipeline</h1>
        
        {status === 'analyzing' && (
          <div className={styles.statusContainer}>
            <div className={styles.analyzing}>1. Analyzing video...</div>
            <p style={{marginTop: '1rem', color: 'var(--kumo-subtle)'}}>Finding the 3 most viral-worthy moments.</p>
          </div>
        )}

        {status === 'rendering' && (
          <div className={styles.statusContainer}>
            <div className={styles.loading}>2. Rendering clips...</div>
            <p style={{marginTop: '1rem', color: 'var(--kumo-subtle)'}}>Cutting video, generating subtitles, and applying formats.</p>
          </div>
        )}

        {status === 'done' && (
          <div className={styles.statusContainer}>
            <div className={styles.doneTitle}>
              Extraction Complete!
            </div>
            <p style={{marginTop: '1rem', marginBottom: '2rem', color: 'var(--kumo-subtle)'}}>
              We've successfully generated 3 highly engaging clips.
            </p>
            <Link href="/library" className={styles.navButton}>
              View in My Library →
            </Link>
          </div>
        )}
        
        {status === 'error' && (
          <div className={styles.statusContainer}>
            <div style={{color: 'red', fontWeight: 'bold', marginBottom: '1rem'}}>
              Processing Failed
            </div>
            <p style={{color: 'var(--kumo-subtle)'}}>{errorMsg}</p>
            <Link href="/" className={styles.navButton} style={{marginTop: '2rem', background: 'transparent', border: '1px solid var(--kumo-border)', color: 'white'}}>
              ← Back to Home
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EditorialPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', color: 'white', background: '#0a0a0a' }}>
        Loading Processing Pipeline...
      </div>
    }>
      <EditorialContent />
    </Suspense>
  );
}
