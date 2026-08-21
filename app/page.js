'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ThemeToggle from './components/ThemeToggle';
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
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoMark}>▶</span>
          <span className={styles.logoText}>Arlo Clipper</span>
        </div>
        <div className={styles.headerActions}>
          <ThemeToggle />
          <Link href="/library" className={styles.libraryLink}>
            Library <span className={styles.arrow}>→</span>
          </Link>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.hero}>
          <div className={styles.tagline}>YOUTUBE → SHORT CLIPS</div>
          <h1 className={styles.headline}>Clip the good parts.</h1>
          <p className={styles.subtitle}>
            Drop a video link. Pick a frame ratio. Get mobile-ready clips with styled subtitles in seconds.
          </p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputWrapper}>
            <input
              type="url"
              className={styles.urlInput}
              placeholder="Paste a YouTube, Vimeo, or Twitch video link"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>

          <div className={styles.platforms}>
            <span className={styles.platformBadge}>
              <span className={styles.platformDot} /> YouTube
            </span>
            <span className={styles.platformBadge}>
              <span className={styles.platformDot} /> Vimeo
            </span>
            <span className={styles.platformBadge}>
              <span className={styles.platformDot} /> Twitch
            </span>
            <span className={styles.platformBadge}>
              <span className={styles.platformDot} /> Facebook
            </span>
          </div>

          <div className={styles.optionsWrapper}>
            <button
              type="button"
              className={styles.toggleOptions}
              onClick={() => setShowOptions(!showOptions)}
            >
              <span className={`${styles.chevron} ${showOptions ? styles.chevronOpen : ''}`}>
                ›
              </span>
              {showOptions ? 'Hide custom options' : 'Customize subtitle & ratio'}
            </button>

            {showOptions && (
              <div className={styles.options}>
                <div className={styles.optionGroup}>
                  <label className={styles.label}>Aspect Ratio</label>
                  <div className={styles.ratioSelector}>
                    <button
                      type="button"
                      className={`${styles.ratioBtn} ${ratio === '9:16' ? styles.activeRatio : ''}`}
                      onClick={() => setRatio('9:16')}
                    >
                      <span className={styles.ratioIcon}>9:16</span> Mobile Vertical
                    </button>
                    <button
                      type="button"
                      className={`${styles.ratioBtn} ${ratio === '16:9' ? styles.activeRatio : ''}`}
                      onClick={() => setRatio('16:9')}
                    >
                      <span className={styles.ratioIcon}>16:9</span> Desktop Landscape
                    </button>
                  </div>
                </div>

                <div className={styles.optionDivider} />

                <div className={styles.optionGroup}>
                  <div className={styles.subtitleToggleRow}>
                    <div>
                      <label className={styles.label}>Auto-generate subtitles</label>
                      <p className={styles.labelDesc}>Transcribe speech and burn text onto clips</p>
                    </div>
                    <button
                      type="button"
                      className={`${styles.switch} ${subtitles ? styles.switchOn : ''}`}
                      onClick={() => setSubtitles(!subtitles)}
                      aria-label="Toggle subtitles"
                    >
                      <span className={styles.switchThumb} />
                    </button>
                  </div>
                </div>

                {subtitles && (
                  <div className={styles.subtitleOptions}>
                    <div className={styles.subOption}>
                      <label className={styles.subLabel}>Font Style</label>
                      <select
                        className={styles.select}
                        value={font}
                        onChange={(e) => setFont(e.target.value)}
                      >
                        <option value="Inter">Inter (Sans)</option>
                        <option value="Impact">Impact (Bold)</option>
                        <option value="Roboto">Roboto</option>
                        <option value="Montserrat">Montserrat</option>
                        <option value="Bangers">Bangers</option>
                      </select>
                    </div>

                    <div className={styles.subOption}>
                      <label className={styles.subLabel}>Size</label>
                      <select
                        className={styles.select}
                        value={size}
                        onChange={(e) => setSize(e.target.value)}
                      >
                        <option value="Small">Small</option>
                        <option value="Medium">Medium</option>
                        <option value="Large">Large</option>
                      </select>
                    </div>

                    <div className={styles.subOption}>
                      <label className={styles.subLabel}>Text Color</label>
                      <div className={styles.colorPickerWrap}>
                        <input
                          type="color"
                          className={styles.colorInput}
                          value={color}
                          onChange={(e) => setColor(e.target.value)}
                        />
                        <span className={styles.colorHex}>{color.toUpperCase()}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <button type="submit" className={styles.submitBtn}>
            Start clipping <span className={styles.arrow}>→</span>
          </button>
        </form>
      </main>
    </div>
  );
}
