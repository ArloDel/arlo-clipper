'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Surface, Badge, Loader, Text } from '@cloudflare/kumo';
import styles from './dashboard.module.css';

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const url = searchParams.get('url');
  const ratio = searchParams.get('ratio') || 'mobile';
  const folderId = searchParams.get('folderId') || null;
  const subtitles = searchParams.get('subtitles') !== 'false'; // default true
  const font = searchParams.get('font') || 'Impact';
  const size = searchParams.get('size') || '24';
  const color = searchParams.get('color') || '#FFFF00';
  
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
          body: JSON.stringify({ url, ratio, subtitles, font, size, color, folderId })
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
  }, [url, ratio, router]);

  const renderStatus = () => {
    const messages = {
      downloading: 'Engaging pipeline algorithms. Processing video stream. ETA: 2-4 minutes.',
      error: 'CRITICAL FAILURE: Pipeline aborted. Check terminal logs.'
    };

    return (
      <div className={styles.statusContainer}>
        {status !== 'error' && (
          <div className={styles.loaderWrapper}>
            <Loader style={{ width: '3rem', height: '3rem', color: 'var(--kumo-brand)' }} />
          </div>
        )}
        <h2 className={styles.statusTitle}>
          {status === 'error' ? 'SYSTEM HALT' : 'PROCESSING'}
        </h2>
        <Text className={styles.statusDesc}>
          {messages[status] || 'INITIALIZING SEQUENCE...'}
        </Text>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href="/" className={styles.logo}>Clipify</Link>
        <Button variant="outline" size="sm" style={{ borderRadius: 0 }}>Terminal</Button>
      </header>

      {status !== 'complete' ? renderStatus() : (
        <div className={styles.contentWrapper}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Extraction Output</h2>
            <Text className="text-sm font-mono text-kumo-subtle">{clips.length} assets generated</Text>
          </div>
          
          <div className={styles.resultsGrid}>
            {clips.map((clip, index) => (
              <Surface 
                key={clip.id} 
                className={`${styles.clipCard} ${styles.staggerItem}`}
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <div className={styles.videoPlaceholder}>
                  <video src={clip.src} controls className={styles.videoElement} />
                </div>
                
                <div className={styles.clipInfo}>
                  <h3 className={styles.clipTitle} title={clip.title}>
                    {clip.title}
                  </h3>
                  
                  <div className={styles.clipMetrics}>
                    <span>DUR_{clip.duration}</span>
                    <span>SCR_{clip.score}</span>
                  </div>
                  
                  <div className={styles.actions}>
                    <div className={styles.actionBtn}>
                      <Button variant="secondary" style={{ width: '100%', borderRadius: 0 }}>REVISE</Button>
                    </div>
                    <a href={clip.src} download className={styles.downloadLink}>
                      <Button variant="primary" style={{ width: '100%', borderRadius: 0 }}>EXPORT</Button>
                    </a>
                  </div>
                </div>
              </Surface>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={
      <div style={{ padding: '4rem', textAlign: 'center', display: 'flex', justifyContent: 'center' }}>
        <Loader />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
