'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function LandingPage() {
  const [url, setUrl] = useState('');
  const [ratio, setRatio] = useState('mobile');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!url) return;
    
    setIsLoading(true);
    // Navigate to dashboard with the URL parameter and ratio
    router.push(`/dashboard?url=${encodeURIComponent(url)}&ratio=${ratio}`);
  };

  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <h1 className={styles.title}>
          Turn videos into <span>viral clips</span> instantly.
        </h1>
        <p className={styles.subtitle}>
          Paste a YouTube link and our AI will automatically find the best moments, crop them, and generate ready-to-post clips.
        </p>

        <form className={styles.actionForm} onSubmit={handleSubmit}>
          <input 
            type="url" 
            placeholder="https://youtube.com/watch?v=..." 
            className={styles.urlInput}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', justifyContent: 'center' }}>
            <label style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="radio" name="ratio" value="mobile" checked={ratio === 'mobile'} onChange={() => setRatio('mobile')} />
              Mobile (9:16)
            </label>
            <label style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="radio" name="ratio" value="desktop" checked={ratio === 'desktop'} onChange={() => setRatio('desktop')} />
              Desktop (16:9)
            </label>
          </div>
          <button 
            type="submit" 
            className={`btn btn-primary ${styles.submitBtn}`}
            disabled={isLoading}
            style={{ marginTop: '1rem' }}
          >
            {isLoading ? 'Processing...' : 'Generate Clips'}
          </button>
        </form>

        <div className={styles.featuresGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>⚡️</div>
            <h3 className={styles.featureTitle}>Lightning Fast</h3>
            <p className={styles.featureDesc}>Get your clips in minutes, not hours. Powered by high-speed processing.</p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🎯</div>
            <h3 className={styles.featureTitle}>AI-Driven Highlights</h3>
            <p className={styles.featureDesc}>Smart algorithms find the most engaging parts of your video automatically.</p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📱</div>
            <h3 className={styles.featureTitle}>Platform Ready</h3>
            <p className={styles.featureDesc}>Auto-cropped for TikTok, Reels, and Shorts. Just download and post.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
