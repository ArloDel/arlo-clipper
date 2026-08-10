'use client'

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
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
      const activeSeg = segments.find(s => time >= s.start && time <= s.end);
      setActiveText(activeSeg ? activeSeg.text : '');
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [segments, videoRef]);

  if (!activeText) return null;

  // Map sizes to CSS roughly mimicking ASS font sizes
  const sizeMap = { small: '1.2rem', medium: '2rem', large: '3rem' };
  const fontSize = sizeMap[style.size?.toLowerCase()] || '2rem';

  const textShadow = [
    style.shadow ? '0px 4px 10px rgba(0,0,0,0.8)' : '',
    style.outline ? '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' : ''
  ].filter(Boolean).join(', ');

  return (
    <div className={editorStyles.subtitleOverlay} style={{
      fontFamily: style.font,
      fontSize: fontSize,
      color: style.color,
      textShadow: textShadow || 'none'
    }}>
      {activeText}
    </div>
  );
}

function EditorStudio({ clips, onSave }) {
  const [activeClipIdx, setActiveClipIdx] = useState(0);
  const [clipStyles, setClipStyles] = useState(
    clips.map(() => ({ font: 'Impact', size: 'Medium', color: '#FFFF00', outline: true, shadow: true }))
  );
  const videoRef = useRef(null);

  const activeClip = clips[activeClipIdx];
  const activeStyle = clipStyles[activeClipIdx];

  const updateStyle = (key, val) => {
    const newStyles = [...clipStyles];
    newStyles[activeClipIdx] = { ...newStyles[activeClipIdx], [key]: val };
    setClipStyles(newStyles);
  };

  const handleSave = () => {
    const finalClips = clips.map((c, i) => ({
      ...c,
      style: clipStyles[i]
    }));
    onSave(finalClips);
  };

  return (
    <div className={editorStyles.editorContainer}>
      <div className={editorStyles.previewSection}>
        <div className={editorStyles.tabs}>
          {clips.map((c, i) => (
            <button 
              key={c.id} 
              className={`${editorStyles.tab} ${i === activeClipIdx ? editorStyles.activeTab : ''}`}
              onClick={() => setActiveClipIdx(i)}
            >
              Clip {i + 1}
            </button>
          ))}
        </div>
        
        <div className={editorStyles.videoWrapper}>
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
        <h3 className={editorStyles.controlsTitle}>Edit Subtitles</h3>
        
        <div className={editorStyles.controlGroup}>
          <label>Font Family</label>
          <select value={activeStyle.font} onChange={(e) => updateStyle('font', e.target.value)} className={editorStyles.input}>
            <option>Impact</option>
            <option>Inter</option>
            <option>Roboto</option>
            <option>Montserrat</option>
            <option>Bangers</option>
          </select>
        </div>

        <div className={editorStyles.controlGroup}>
          <label>Font Size</label>
          <select value={activeStyle.size} onChange={(e) => updateStyle('size', e.target.value)} className={editorStyles.input}>
            <option>Small</option>
            <option>Medium</option>
            <option>Large</option>
          </select>
        </div>

        <div className={editorStyles.controlGroup}>
          <label>Text Color</label>
          <input type="color" value={activeStyle.color} onChange={(e) => updateStyle('color', e.target.value)} className={editorStyles.colorInput} />
        </div>

        <div className={editorStyles.toggleGroup}>
          <label>Text Outline</label>
          <input type="checkbox" checked={activeStyle.outline} onChange={(e) => updateStyle('outline', e.target.checked)} />
        </div>

        <div className={editorStyles.toggleGroup}>
          <label>Drop Shadow</label>
          <input type="checkbox" checked={activeStyle.shadow} onChange={(e) => updateStyle('shadow', e.target.checked)} />
        </div>

        <button className={editorStyles.saveButton} onClick={handleSave}>
          Save to Library →
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
          body: JSON.stringify({ url })
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
          body: JSON.stringify({ url, clips, ratio })
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
    return () => { isMounted = false; };
  }, [url, ratio]);

  const handleSaveFinal = async (finalClips) => {
    setStatus('rendering');
    try {
      const renderRes = await fetch('/api/render-final', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clips: finalClips })
      });
      
      if (!renderRes.ok) throw new Error('Failed to render final clips');
      
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err.message || 'Failed to render final clips');
    }
  };

  if (status === 'editing') {
    return (
      <div className={styles.container}>
        <div className={styles.videoHeader}>
          <h1 className={styles.title}>Realtime Editor</h1>
          <p className={styles.subtitle}>Customize your subtitles before saving.</p>
        </div>
        <EditorStudio clips={preparedClips} onSave={handleSaveFinal} />
      </div>
    );
  }

  const steps = [
    { id: 'analyzing', label: 'Analyzing Content', description: 'Transcribing and finding viral moments' },
    { id: 'preparing', label: 'Preparing Editor', description: 'Extracting audio and slicing clips' },
    { id: 'rendering', label: 'Rendering Final', description: 'Burning subtitles' },
    { id: 'done', label: 'Ready', description: 'Clips are saved to your library' }
  ];
  
  // Skip editing step in the stepper, we just show the editor UI
  const effectiveStatus = status === 'error' ? 'analyzing' : status;
  const currentStepIndex = steps.findIndex(s => s.id === effectiveStatus);
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
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          ) : (
            <div className={styles.noVideo}>
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
          <div className={styles.doneCard}>
            <div className={styles.doneIcon}>✓</div>
            <h3>Extraction Complete!</h3>
            <Link href="/library" className={styles.primaryButton}>
              View in Library →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EditorialPage() {
  return (
    <Suspense fallback={<div className={styles.loadingPulse}>Loading...</div>}>
      <EditorialContent />
    </Suspense>
  );
}
