'use client'

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';

function getYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
  return match ? match[1] : null;
}

function EditorialContent() {
  const searchParams = useSearchParams();
  const url = searchParams.get('url');
  const ratio = searchParams.get('ratio') || '9:16';
  const subtitles = searchParams.get('subtitles') || 'true';
  const font = searchParams.get('font') || 'impact';
  const size = searchParams.get('size') || 'medium';
  const color = searchParams.get('color') || 'yellow';

  const [status, setStatus] = useState('analyzing'); // 'analyzing', 'rendering', 'done', 'error'
  const [errorMessage, setErrorMessage] = useState('');
  
  const videoId = getYouTubeId(url);

  useEffect(() => {
    let isMounted = true;
    
    async function processVideo() {
      try {
        if (!url) throw new Error('No video URL provided.');
        
        // 1. Analyze
        const analyzeRes = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        
        if (!analyzeRes.ok) {
          throw new Error('Failed to analyze video');
        }
        
        const analyzeData = await analyzeRes.json();
        const clips = analyzeData.clips;
        
        if (!clips || clips.length === 0) {
          throw new Error('No engaging clips found by the algorithm.');
        }

        if (isMounted) setStatus('rendering');
        
        // 2. Render
        const renderRes = await fetch('/api/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, clips, ratio, subtitles, font, size, color })
        });
        
        if (!renderRes.ok) {
          throw new Error('Failed to render clips');
        }
        
        if (isMounted) setStatus('done');
        
      } catch (err) {
        if (isMounted) {
          setStatus('error');
          setErrorMessage(err.message || 'An unknown error occurred');
        }
      }
    }
    
    processVideo();
    
    return () => { isMounted = false; };
  }, [url, ratio, subtitles, font, size, color]);

  const steps = [
    { id: 'analyzing', label: 'Analyzing Content', description: 'Transcribing and finding viral moments' },
    { id: 'rendering', label: 'Rendering Clips', description: 'Applying captions and cropping' },
    { id: 'done', label: 'Ready', description: 'Clips are saved to your library' }
  ];
  
  const currentStepIndex = steps.findIndex(s => s.id === status);
  const isDoneOrError = status === 'done' || status === 'error';

  return (
    <div className={styles.container}>
      <div className={styles.videoSection}>
        <div className={styles.videoHeader}>
          <h1 className={styles.title}>Processing Your Video</h1>
          <p className={styles.subtitle}>We're extracting the best moments from your content.</p>
        </div>
        
        <div className={styles.videoWrapper}>
          {videoId ? (
            <iframe
              className={styles.iframe}
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          ) : (
            <div className={styles.placeholder}>
              <p>Invalid or missing video URL</p>
            </div>
          )}
        </div>
      </div>

      <div className={styles.sidebar}>
        <h2 className={styles.sidebarTitle}>Status</h2>
        
        {status === 'error' ? (
          <div className={styles.errorCard}>
            <div className={styles.errorIcon}>!</div>
            <h3>Processing Failed</h3>
            <p>{errorMessage}</p>
            <Link href="/" className={styles.secondaryButton}>
              Go Back
            </Link>
          </div>
        ) : (
          <div className={styles.stepper}>
            {steps.map((step, index) => {
              const isCompleted = currentStepIndex > index || status === 'done';
              const isActive = status === step.id;
              
              return (
                <div key={step.id} className={`${styles.step} ${isActive ? styles.stepActive : ''} ${isCompleted ? styles.stepCompleted : ''}`}>
                  <div className={styles.stepIndicator}>
                    <div className={styles.dot}></div>
                    {index < steps.length - 1 && <div className={styles.line}></div>}
                  </div>
                  <div className={styles.stepContent}>
                    <div className={styles.stepLabel}>{step.label}</div>
                    <div className={styles.stepDesc}>{step.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {status === 'done' && (
          <div className={styles.successCard}>
            <div className={styles.successIcon}>✓</div>
            <h3>Extraction Complete!</h3>
            <p>Your viral clips are ready.</p>
            <Link href="/library" className={styles.primaryButton}>
              View in Library &rarr;
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
      <div className={styles.fallbackContainer}>
        <div className={styles.spinner}></div>
        <p>Loading editor...</p>
      </div>
    }>
      <EditorialContent />
    </Suspense>
  );
}
