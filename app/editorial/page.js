'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ThemeToggle from '../components/ThemeToggle';
import styles from './page.module.css';
import editorStyles from './editor.module.css';

function getYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
  return match ? match[1] : null;
}

function SubtitleOverlay({ videoRef, segments, style }) {
  const [activeText, setActiveText] = useState('');

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const time = video.currentTime;
      const activeSeg = segments.find((s) => time >= s.start && time <= s.end);
      setActiveText(activeSeg ? activeSeg.text : '');
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [segments, videoRef]);

  if (!activeText) return null;

  const sizeMap = { small: '1.1rem', medium: '1.8rem', large: '2.5rem' };
  const fontSize = sizeMap[style.size?.toLowerCase()] || '1.8rem';

  const textShadow = [
    style.shadow ? '0px 2px 8px rgba(0,0,0,0.9)' : '',
    style.outline ? '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' : '',
  ]
    .filter(Boolean)
    .join(', ');

  const getAnimationClass = (anim) => {
    switch (anim) {
      case 'Pop':
        return editorStyles.animatePop;
      case 'Slide Up':
        return editorStyles.animateSlideUp;
      case 'Blur':
        return editorStyles.animateBlur;
      case 'Bounce':
        return editorStyles.animateBounce;
      default:
        return '';
    }
  };

  return (
    <div
      key={style.animation !== 'None' ? activeText : 'static'}
      className={`${editorStyles.subtitleOverlay} ${getAnimationClass(style.animation)}`}
      style={{
        fontFamily: style.font,
        fontSize: fontSize,
        color: style.color,
        textShadow: textShadow || 'none',
      }}
    >
      {activeText}
    </div>
  );
}

function EditorStudio({ clips, onSave, ratio }) {
  const [activeClipIdx, setActiveClipIdx] = useState(0);
  const [clipStyles, setClipStyles] = useState(
    clips.map(() => ({
      font: 'Impact',
      size: 'Medium',
      color: '#FFFF00',
      outline: true,
      shadow: true,
      animation: 'Pop',
    }))
  );
  const videoRef = useRef(null);

  const activeClip = clips[activeClipIdx];
  const activeStyle = clipStyles[activeClipIdx];
  const isMobile = ratio === '9:16' || ratio === 'mobile';

  const updateStyle = (key, val) => {
    const newStyles = [...clipStyles];
    newStyles[activeClipIdx] = { ...newStyles[activeClipIdx], [key]: val };
    setClipStyles(newStyles);
  };

  const handleSave = () => {
    const finalClips = clips.map((c, i) => ({
      ...c,
      style: clipStyles[i],
    }));
    onSave(finalClips);
  };

  return (
    <div className={editorStyles.editorContainer}>
      <div className={editorStyles.previewSection}>
        <div className={editorStyles.tabs}>
          {clips.map((c, i) => (
            <button
              key={c.id || i}
              className={`${editorStyles.tab} ${i === activeClipIdx ? editorStyles.activeTab : ''}`}
              onClick={() => setActiveClipIdx(i)}
            >
              Clip {i + 1}
            </button>
          ))}
        </div>

        <div
          className={editorStyles.videoWrapper}
          style={{ aspectRatio: isMobile ? '9 / 16' : '16 / 9' }}
        >
          <video
            ref={videoRef}
            src={activeClip.videoPath}
            controls
            className={editorStyles.video}
            key={activeClip.videoPath}
          />
          <SubtitleOverlay videoRef={videoRef} segments={activeClip.segments} style={activeStyle} />
        </div>
      </div>

      <div className={editorStyles.controlsSection}>
        <div className={editorStyles.controlsHeader}>
          <h3 className={editorStyles.controlsTitle}>Subtitle Settings</h3>
          <span className={editorStyles.controlsBadge}>Clip {activeClipIdx + 1}</span>
        </div>

        <div className={editorStyles.controlGroup}>
          <label className={editorStyles.controlLabel}>Font Family</label>
          <select
            value={activeStyle.font}
            onChange={(e) => updateStyle('font', e.target.value)}
            className={editorStyles.input}
          >
            <option>Impact</option>
            <option>Inter</option>
            <option>Roboto</option>
            <option>Montserrat</option>
            <option>Bangers</option>
          </select>
        </div>

        <div className={editorStyles.controlGroup}>
          <label className={editorStyles.controlLabel}>Font Size</label>
          <select
            value={activeStyle.size}
            onChange={(e) => updateStyle('size', e.target.value)}
            className={editorStyles.input}
          >
            <option>Small</option>
            <option>Medium</option>
            <option>Large</option>
          </select>
        </div>

        <div className={editorStyles.controlGroup}>
          <label className={editorStyles.controlLabel}>Text Color</label>
          <div className={editorStyles.colorWrap}>
            <input
              type="color"
              value={activeStyle.color}
              onChange={(e) => updateStyle('color', e.target.value)}
              className={editorStyles.colorInput}
            />
            <span className={editorStyles.colorHex}>{activeStyle.color.toUpperCase()}</span>
          </div>
        </div>

        <div className={editorStyles.togglesRow}>
          <label className={editorStyles.checkboxLabel}>
            <input
              type="checkbox"
              checked={activeStyle.outline}
              onChange={(e) => updateStyle('outline', e.target.checked)}
              className={editorStyles.checkbox}
            />
            <span>Text Outline</span>
          </label>

          <label className={editorStyles.checkboxLabel}>
            <input
              type="checkbox"
              checked={activeStyle.shadow}
              onChange={(e) => updateStyle('shadow', e.target.checked)}
              className={editorStyles.checkbox}
            />
            <span>Drop Shadow</span>
          </label>
        </div>

        <div className={editorStyles.controlGroup}>
          <label className={editorStyles.controlLabel}>Animation Style</label>
          <select
            value={activeStyle.animation}
            onChange={(e) => updateStyle('animation', e.target.value)}
            className={editorStyles.input}
          >
            <option>None</option>
            <option>Pop</option>
            <option>Slide Up</option>
            <option>Blur</option>
            <option>Bounce</option>
          </select>
        </div>

        <button className={editorStyles.saveButton} onClick={handleSave}>
          Save to Library <span className={editorStyles.arrow}>→</span>
        </button>
      </div>
    </div>
  );
}

function EditorialContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const url = searchParams.get('url');
  const ratio = searchParams.get('ratio') || '9:16';

  // States: analyzing -> preparing -> editing -> rendering -> done
  const [status, setStatus] = useState('analyzing');
  const [errorMessage, setErrorMessage] = useState('');
  const [preparedClips, setPreparedClips] = useState([]);

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
          body: JSON.stringify({ url }),
        });

        if (!analyzeRes.ok) throw new Error('Failed to analyze video');
        const analyzeData = await analyzeRes.json();
        const clips = analyzeData.clips;
        if (!clips || clips.length === 0) throw new Error('No engaging clips found by the algorithm.');

        if (isMounted) setStatus('preparing');

        // 2. Prepare Editor (Slice & Transcribe)
        const prepRes = await fetch('/api/prepare-editor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, clips, ratio }),
        });

        if (!prepRes.ok) throw new Error('Failed to prepare clips for editing');
        const prepData = await prepRes.json();

        if (isMounted) {
          setPreparedClips(prepData.clips);
          setStatus('editing');
        }
      } catch (err) {
        if (isMounted) {
          setStatus('error');
          setErrorMessage(err.message || 'An unknown error occurred');
        }
      }
    }

    processVideo();
    return () => {
      isMounted = false;
    };
  }, [url, ratio]);

  const handleSaveFinal = async (finalClips) => {
    setStatus('rendering');
    try {
      const renderRes = await fetch('/api/render-final', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clips: finalClips }),
      });

      if (!renderRes.ok) throw new Error('Failed to render final clips');

      setStatus('done');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err.message || 'Failed to render final clips');
    }
  };

  const steps = [
    { id: 'analyzing', label: 'Analyzing Content', description: 'Transcribing speech & finding hooks' },
    { id: 'preparing', label: 'Preparing Editor', description: 'Extracting video & slicing segments' },
    { id: 'rendering', label: 'Rendering Clips', description: 'Burning styled subtitles to output' },
    { id: 'done', label: 'Ready', description: 'Saved to your personal library' },
  ];

  const effectiveStatus = status === 'error' ? 'analyzing' : status;
  const currentStepIndex = steps.findIndex((s) => s.id === effectiveStatus);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/" className={styles.backLink}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Home
          </Link>
          <div className={styles.headerTitle}>
            {status === 'editing' ? 'Realtime Subtitle Studio' : 'Processing Content'}
          </div>
        </div>
        <div className={styles.headerRight}>
          <ThemeToggle />
          <Link href="/library" className={styles.libraryLink}>
            Library →
          </Link>
        </div>
      </header>

      {status === 'editing' ? (
        <main className={styles.editorMain}>
          <EditorStudio clips={preparedClips} onSave={handleSaveFinal} ratio={ratio} />
        </main>
      ) : (
        <main className={styles.mainGrid}>
          <div className={styles.videoSection}>
            <div className={styles.videoWrapper}>
              {videoId ? (
                <iframe
                  className={styles.iframe}
                  src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1`}
                  title="YouTube video player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className={styles.noVideo}>
                  <p>Processing media stream...</p>
                </div>
              )}
            </div>
          </div>

          <aside className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <h2 className={styles.sidebarTitle}>Status Pipeline</h2>
              <span className={styles.ratioBadge}>{ratio}</span>
            </div>

            {status === 'error' ? (
              <div className={styles.errorCard}>
                <div className={styles.errorIcon}>!</div>
                <h3 className={styles.cardTitle}>Extraction Failed</h3>
                <p className={styles.cardDesc}>{errorMessage}</p>
                <Link href="/" className={styles.secondaryButton}>
                  ← Back to Home
                </Link>
              </div>
            ) : (
              <div className={styles.stepper}>
                {steps.map((step, index) => {
                  const isCompleted = currentStepIndex > index || status === 'done';
                  const isActive = status === step.id;

                  return (
                    <div
                      key={step.id}
                      className={`${styles.step} ${isActive ? styles.stepActive : ''} ${
                        isCompleted ? styles.stepCompleted : ''
                      }`}
                    >
                      <div className={styles.stepIndicator}>
                        <div className={styles.dot} />
                        {index < steps.length - 1 && <div className={styles.line} />}
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
              <div className={styles.doneCard}>
                <div className={styles.doneIcon}>✓</div>
                <h3 className={styles.cardTitle}>Processing Complete</h3>
                <p className={styles.cardDesc}>All clips rendered and stored in your library.</p>
                <Link href="/library" className={styles.primaryButton}>
                  View in Library →
                </Link>
              </div>
            )}
          </aside>
        </main>
      )}
    </div>
  );
}

export default function EditorialPage() {
  return (
    <Suspense fallback={<div className={styles.loadingPulse}>Loading editor...</div>}>
      <EditorialContent />
    </Suspense>
  );
}
