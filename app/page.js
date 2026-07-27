'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function LandingPage() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!url) return;
    
    setIsLoading(true);
    // Navigate to dashboard with the URL parameter
    router.push(`/dashboard?url=${encodeURIComponent(url)}`);
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
          <button 
            type="submit" 
            className={`btn btn-primary ${styles.submitBtn}`}
            disabled={isLoading}
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
