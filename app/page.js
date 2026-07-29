'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Input, Text } from '@cloudflare/kumo';
import styles from './page.module.css';

export default function LandingPage() {
  const [url, setUrl] = useState('');
  const [ratio, setRatio] = useState('mobile');
  const [folderId, setFolderId] = useState('');
  const [folders, setFolders] = useState([]);
  const [useSubtitles, setUseSubtitles] = useState(true);
  const [font, setFont] = useState('Impact');
  const [size, setSize] = useState('24');
  const [color, setColor] = useState('#FFFF00');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/folders').then(res => res.json()).then(setFolders).catch(() => {});
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!url) return;
    
    setIsLoading(true);
    router.push(`/dashboard?url=${encodeURIComponent(url)}&ratio=${ratio}&subtitles=${useSubtitles}&font=${encodeURIComponent(font)}&size=${size}&color=${encodeURIComponent(color)}&folderId=${folderId}`);
  };

  return (
    <main className={styles.main}>
      <div className={styles.splitLayout}>
        <div className={styles.leftPane}>
          <div className={styles.heroContent}>
            <h1 className={styles.title}>
              Extract.<br />
              <em>Analyze.</em><br />
              Clip.
            </h1>
            <p className={styles.subtitle}>
              The editorial tool for the modern creator. Input a video link, and our algorithms will automatically slice the defining moments into ready-to-publish formats.
            </p>
          </div>
        </div>

        <div className={styles.rightPane}>
          <div style={{ position: 'absolute', top: '2rem', right: '2rem' }}>
            <Link href="/library" className={styles.navLink} style={{ color: 'var(--kumo-subtle)', fontWeight: 'bold', textDecoration: 'none', letterSpacing: '0.1em' }}>LIBRARY →</Link>
          </div>
          
          <form
            className={styles.actionForm}
            onSubmit={handleSubmit}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <Text className="text-xl font-medium">New Project</Text>
              
              {folders.length > 0 && (
                <select 
                  className={styles.nativeSelect} 
                  style={{ width: 'auto', padding: '0.25rem 0.5rem' }}
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                >
                  <option value="">No Folder</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              )}
            </div>

            <Input
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              size="lg"
              label="Source Link"
            />

            <div className={styles.ratioContainer}>
              <Text className="text-sm font-medium">Target Format</Text>
              <div className={styles.ratioGroup}>
                <label className={styles.ratioLabel}>
                  <input
                    type="radio"
                    name="ratio"
                    value="mobile"
                    checked={ratio === 'mobile'}
                    onChange={() => setRatio('mobile')}
                  />
                  9:16 Mobile
                </label>
                <label className={styles.ratioLabel}>
                  <input
                    type="radio"
                    name="ratio"
                    value="desktop"
                    checked={ratio === 'desktop'}
                    onChange={() => setRatio('desktop')}
                  />
                  16:9 Desktop
                </label>
              </div>
            </div>

            <div className={styles.subtitleOptions}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <Text className="text-sm font-medium">Auto-Generate Subtitles</Text>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={useSubtitles} 
                    onChange={(e) => setUseSubtitles(e.target.checked)}
                    style={{ width: '1.25rem', height: '1.25rem', accentColor: 'var(--kumo-brand)' }}
                  />
                </label>
              </div>
              
              {useSubtitles && (
                <>
                  <div className={styles.optionsGrid}>
                    <div className={styles.optionItem}>
                      <Text className="text-xs text-kumo-subtle">Typography</Text>
                      <select 
                        className={styles.nativeSelect} 
                        value={font} 
                        onChange={(e) => setFont(e.target.value)}
                      >
                        <option value="Arial">Arial (Clean)</option>
                        <option value="Impact">Impact (Bold)</option>
                        <option value="Tahoma">Tahoma (Modern)</option>
                        <option value="Times New Roman">Times (Editorial)</option>
                      </select>
                    </div>
                    
                    <div className={styles.optionItem}>
                      <Text className="text-xs text-kumo-subtle">Scale</Text>
                      <select 
                        className={styles.nativeSelect} 
                        value={size} 
                        onChange={(e) => setSize(e.target.value)}
                      >
                        <option value="16">Small</option>
                        <option value="24">Medium</option>
                        <option value="32">Large</option>
                        <option value="42">Display</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className={styles.colorPickerRow}>
                    <input 
                      type="color" 
                      className={styles.colorInput} 
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      title="Choose Subtitle Color"
                    />
                    <Text className="text-sm">{color.toUpperCase()}</Text>
                  </div>
                </>
              )}
            </div>

            <div className={styles.submitWrapper}>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={isLoading}
                style={{ width: '100%', borderRadius: 10 }} // Brutalist sharp button
              >
                {isLoading ? 'Processing Pipeline...' : 'Commence Extraction'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
