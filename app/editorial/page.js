'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';

export default function EditorialPage() {
  const searchParams = useSearchParams();
  const url = searchParams.get('url');
  
  const initialSubtitles = searchParams.get('subtitles') === 'true';
  const initialFont = searchParams.get('font') || 'Impact';
  const initialSize = searchParams.get('size') || '24';
  const initialColor = searchParams.get('color') || '#FFFF00';
  const initialFolderId = searchParams.get('folderId') || '';

  const [status, setStatus] = useState('analyzing'); // analyzing, loaded, rendering, done
  const [clips, setClips] = useState([]);
  const [selectedClips, setSelectedClips] = useState([]);
  
  const [useSubtitles, setUseSubtitles] = useState(initialSubtitles);
  const [font, setFont] = useState(initialFont);
  const [size, setSize] = useState(initialSize);
  const [color, setColor] = useState(initialColor);
  const [folderId, setFolderId] = useState(initialFolderId);
  const [folders, setFolders] = useState([]);

  useEffect(() => {
    // Fix for Next.js 15 client hydration where searchParams might be empty on initial render
    const urlSub = searchParams.get('subtitles');
    if (urlSub !== null) setUseSubtitles(urlSub === 'true');
    const urlFont = searchParams.get('font');
    if (urlFont) setFont(urlFont);
    const urlSize = searchParams.get('size');
    if (urlSize) setSize(urlSize);
    const urlColor = searchParams.get('color');
    if (urlColor) setColor(urlColor);
    const urlFolder = searchParams.get('folderId');
    if (urlFolder) setFolderId(urlFolder);
  }, [searchParams]);

  useEffect(() => {
    fetch('/api/folders').then(res => res.json()).then(setFolders).catch(() => {});
  }, []);

  useEffect(() => {
    if (!url) return;
    
    fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    })
      .then(res => res.json())
      .then(data => {
        if (data.clips && data.clips.length > 0) {
          setClips(data.clips);
          setStatus('loaded');
        } else {
          // Dummy data fallback if no clips returned
          setClips([
            { id: 1, text: "Wait, so the Earth is actually round?", start: "00:10", end: "00:15" },
            { id: 2, text: "I can't believe it's not butter.", start: "01:20", end: "01:25" },
            { id: 3, text: "Subscribe for more content!", start: "10:00", end: "10:05" }
          ]);
          setStatus('loaded');
        }
      })
      .catch(err => {
        // Fallback for demo purposes
        setClips([
          { id: 1, text: "Error fetching, using fallback clip 1", start: "00:00", end: "00:10" },
          { id: 2, text: "Fallback clip 2 for demonstration", start: "00:10", end: "00:20" }
        ]);
        setStatus('loaded');
      });
  }, [url]);

  const toggleClip = (id) => {
    if (selectedClips.includes(id)) {
      setSelectedClips(selectedClips.filter(cId => cId !== id));
    } else {
      setSelectedClips([...selectedClips, id]);
    }
  };

  const handleExecute = () => {
    setStatus('rendering');
    fetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        clips: clips.filter((c, idx) => selectedClips.includes(c.id || c.title || idx)),
        subtitles: useSubtitles,
        font,
        size,
        color,
        folderId
      })
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Render failed');
        }
        setStatus('done');
      })
      .catch((err) => {
        console.error(err);
        alert('Gagal mengeksekusi klip: ' + err.message);
        setStatus('loaded');
      });
  };

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
        <h1 className={styles.title}>Editorial Suite</h1>
        
        {status === 'analyzing' && (
          <div className={styles.statusContainer}>
            <div className={styles.analyzing}>Analyzing video...</div>
          </div>
        )}

        {status === 'loaded' && (
          <>
            <div className={styles.clipList}>
              {clips.map((clip, idx) => {
                const clipId = clip.id || clip.title || idx;
                return (
                <label key={clipId} className={styles.clipItem}>
                  <input
                    type="checkbox"
                    className={styles.clipCheckbox}
                    checked={selectedClips.includes(clipId)}
                    onChange={() => toggleClip(clipId)}
                  />
                  <div className={styles.clipContent}>
                    <div className={styles.clipText}>&quot;{clip.title || clip.text}&quot;</div>
                    <div className={styles.clipTime}>{clip.start_time || clip.start} - {clip.end_time || clip.end}</div>
                  </div>
                </label>
              )})}
            </div>

            <div className={styles.optionsSection}>
              <div className={styles.optionRow}>
                <span className={styles.optionLabel}>Subtitles</span>
                <input 
                  type="checkbox" 
                  checked={useSubtitles} 
                  onChange={(e) => setUseSubtitles(e.target.checked)} 
                  className={styles.clipCheckbox}
                />
              </div>
              <div className={styles.optionRow}>
                <span className={styles.optionLabel}>Font</span>
                <select className={styles.optionInput} value={font} onChange={e => setFont(e.target.value)}>
                  <option value="Impact">Impact</option>
                  <option value="Arial">Arial</option>
                  <option value="Times New Roman">Times</option>
                </select>
              </div>
              <div className={styles.optionRow}>
                <span className={styles.optionLabel}>Size</span>
                <input className={styles.optionInput} type="number" value={size} onChange={e => setSize(e.target.value)} style={{ width: '80px' }} />
              </div>
              <div className={styles.optionRow}>
                <span className={styles.optionLabel}>Color</span>
                <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: '50px', height: '40px', padding: '0', background: 'transparent', border: 'none' }} />
              </div>
              <div className={styles.optionRow}>
                <span className={styles.optionLabel}>Folder</span>
                <select 
                  className={styles.optionInput} 
                  value={folderId} 
                  onChange={e => setFolderId(e.target.value)}
                  style={{ width: '120px' }}
                >
                  <option value="">(Tanpa Folder)</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <button 
              className={styles.giantButton} 
              onClick={handleExecute}
              disabled={selectedClips.length === 0}
            >
              Render Selected
            </button>
          </>
        )}

        {status === 'rendering' && (
          <div className={styles.statusContainer}>
            <div className={styles.loading}>Rendering clips...</div>
          </div>
        )}

        {status === 'done' && (
          <div className={styles.statusContainer}>
            <div className={styles.doneTitle}>
              Render Complete
            </div>
            <Link href="/library" className={styles.navButton}>
              View in Library →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
