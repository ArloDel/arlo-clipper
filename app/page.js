'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [ratio, setRatio] = useState('9:16');
  const [subtitles, setSubtitles] = useState(true);
  const [font, setFont] = useState('Inter');
  const [size, setSize] = useState('Medium');
  const [color, setColor] = useState('#ffffff');
  const [showOptions, setShowOptions] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!url) return;
    
    const params = new URLSearchParams({
      url,
      ratio,
      subtitles: subtitles.toString(),
      font,
      size,
      color,
    });
    
    router.push(`/editorial?${params.toString()}`);
  };

  return (
    <div className={styles.container}>
      <div className={styles.glow} />
      
      <header className={styles.header}>
        <div className={styles.logo}>Arlo Clipper</div>
        <Link href="/library" className={styles.libraryLink}>
          My Library <span className={styles.arrow}>→</span>
        </Link>
      </header>

      <main className={styles.main}>
        <div className={styles.hero}>
          <h1 className={styles.headline}>
            Turn long videos into <span className={styles.gradientText}>viral clips</span>
          </h1>
          <p className={styles.subtitle}>
            Upload a video link and our AI will automatically find the best moments, crop them for mobile, and add engaging captions in minutes.
          </p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputWrapper}>
            <input
              type="url"
              className={styles.urlInput}
              placeholder="Paste a YouTube link to get started..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>
          
          <div className={styles.platforms}>
            YouTube · Vimeo · Twitch · Facebook
          </div>

          <button 
            type="button" 
            className={styles.toggleOptions}
            onClick={() => setShowOptions(!showOptions)}
          >
            {showOptions ? 'Hide Options' : 'Show Advanced Options'}
          </button>

          {showOptions && (
            <div className={styles.options}>
              <div className={styles.optionGroup}>
                <label className={styles.label}>Aspect Ratio</label>
                <div className={styles.ratioSelector}>
                  <button
                    type="button"
                    className={`${styles.ratioBtn} ${ratio === '9:16' ? styles.active : ''}`}
                    onClick={() => setRatio('9:16')}
                  >
                    9:16 Mobile
                  </button>
                  <button
                    type="button"
                    className={`${styles.ratioBtn} ${ratio === '16:9' ? styles.active : ''}`}
                    onClick={() => setRatio('16:9')}
                  >
                    16:9 Desktop
                  </button>
                </div>
              </div>

              <div className={styles.optionGroup}>
                <div className={styles.subtitleToggle}>
                  <label className={styles.label}>Add Subtitles</label>
                  <button
                    type="button"
                    className={`${styles.switch} ${subtitles ? styles.switchOn : ''}`}
                    onClick={() => setSubtitles(!subtitles)}
                  >
                    <span className={styles.switchThumb} />
                  </button>
                </div>
              </div>

              {subtitles && (
                <div className={styles.subtitleOptions}>
                  <div className={styles.subOption}>
                    <label className={styles.label}>Font</label>
                    <select 
                      className={styles.select} 
                      value={font} 
                      onChange={(e) => setFont(e.target.value)}
                    >
                      <option>Inter</option>
                      <option>Roboto</option>
                      <option>Montserrat</option>
                      <option>Bangers</option>
                    </select>
                  </div>
                  <div className={styles.subOption}>
                    <label className={styles.label}>Size</label>
                    <select 
                      className={styles.select} 
                      value={size} 
                      onChange={(e) => setSize(e.target.value)}
                    >
                      <option>Small</option>
                      <option>Medium</option>
                      <option>Large</option>
                    </select>
                  </div>
                  <div className={styles.subOption}>
                    <label className={styles.label}>Color</label>
                    <input 
                      type="color" 
                      className={styles.colorInput}
                      value={color} 
                      onChange={(e) => setColor(e.target.value)} 
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <button type="submit" className={styles.submitBtn}>
            Get Free Clips <span className={styles.arrow}>→</span>
          </button>
        </form>
      </main>
    </div>
  );
}
