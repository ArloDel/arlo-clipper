'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Text } from '@cloudflare/kumo';
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
    router.push(`/dashboard?url=${encodeURIComponent(url)}&ratio=${ratio}`);
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
          <form
            className={styles.actionForm}
            onSubmit={handleSubmit}
          >
            <Text className="text-xl font-medium mb-4">New Project</Text>

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
