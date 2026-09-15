'use client';

import React, { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import Link from 'next/link';
import ThemeToggle from '../components/ThemeToggle';
import WebhookModal, { WebhookTriggerButton } from '../components/WebhookModal';
import { getYouTubeCopy, getInstagramCopy, getTikTokCopy } from '../../lib/socialCopy';
import styles from './bot.module.css';

const emptySubscribe = () => () => {};

export default function AutoBotPage() {
  const [activeTab, setActiveTab] = useState('config'); // 'config' | 'videos' | 'logs'
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const hasInitializedInput = React.useRef(false);

  // Status & Config State
  const [config, setConfig] = useState({
    enabled: false,
    channelUrl: '',
    channelId: '',
    channelName: '',
    checkIntervalMinutes: 60,
    maxVideosPerCheck: 1,
    maxClipsPerVideo: 3,
    lastCheckedAt: null,
    nextCheckAt: null,
    preset: {
      ratio: '9:16',
      faceTracking: false,
      splitScreen: false,
      subtitles: true,
      subtitleAnimation: 'Pop',
      font: 'Impact',
      fontSize: 'Medium',
      color: '#FFFF00',
      broll: 'auto',
      bgm: 'upbeat-energetic',
      ducking: 'medium',
      sfx: true,
    },
    exportSettings: {
      autoExport: true,
      exportDir: 'exports',
      generateTxtMetadata: true,
      generateJsonMetadata: true,
    },
  });

  const [isRunning, setIsRunning] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Channel Preview State
  const [channelInput, setChannelInput] = useState('');
  const [channelPreview, setChannelPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  // History & Logs State
  const [processedVideos, setProcessedVideos] = useState([]);
  const [logs, setLogs] = useState([]);
  const [copyFeedback, setCopyFeedback] = useState({});

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Load Status & Config
  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/bot/status');
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setConfig(data.config);
          if (!hasInitializedInput.current) {
            if (data.config.channelUrl) {
              setChannelInput(data.config.channelUrl);
              hasInitializedInput.current = true;
            } else if (data.config.channelId) {
              setChannelInput(data.config.channelId);
              hasInitializedInput.current = true;
            }
          }
        }
        if (data.status) {
          setIsRunning(data.status.isRunning);
          setIsChecking(data.status.isChecking);
        }
      }
    } catch (e) {
      console.warn('Failed to load bot status:', e);
    }
  }, []);

  // Load History & Logs
  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/bot/history?limit=50');
      if (res.ok) {
        const data = await res.json();
        setProcessedVideos(data.processedVideos || []);
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.warn('Failed to load bot history:', e);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    const fetchAllData = () => {
      fetch('/api/bot/status')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!ignore && data) {
            if (data.config) {
              setConfig(data.config);
              if (!hasInitializedInput.current) {
                if (data.config.channelUrl) {
                  setChannelInput(data.config.channelUrl);
                  hasInitializedInput.current = true;
                } else if (data.config.channelId) {
                  setChannelInput(data.config.channelId);
                  hasInitializedInput.current = true;
                }
              }
            }
            if (data.status) {
              setIsRunning(data.status.isRunning);
              setIsChecking(data.status.isChecking);
            }
          }
        })
        .catch((e) => console.warn('Failed to load bot status:', e));

      fetch('/api/bot/history?limit=50')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!ignore && data) {
            setProcessedVideos(data.processedVideos || []);
            setLogs(data.logs || []);
          }
        })
        .catch((e) => console.warn('Failed to load bot history:', e));
    };

    fetchAllData();

    const intervalId = setInterval(fetchAllData, 12000);

    return () => {
      ignore = true;
      clearInterval(intervalId);
    };
  }, []);

  // Handle Save Configuration
  const handleSaveConfig = async (e) => {
    if (e) e.preventDefault();
    setSavingConfig(true);
    try {
      const payload = {
        ...config,
        channelUrl: channelInput.trim(),
      };

      const res = await fetch('/api/bot/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        setIsRunning(data.status?.isRunning || false);
        showToast('✓ Konfigurasi bot berhasil disimpan!');
      } else {
        const errData = await res.json();
        alert(`Gagal menyimpan konfigurasi: ${errData.error || 'Terjadi kesalahan'}`);
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setSavingConfig(false);
    }
  };

  // Toggle Bot Enable / Disable
  const handleToggleBot = async () => {
    const nextEnabled = !config.enabled;
    try {
      const res = await fetch('/api/bot/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, enabled: nextEnabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        setIsRunning(data.status?.isRunning || false);
        showToast(nextEnabled ? '🟢 Bot Otomatisasi Diaktifkan!' : '⏸️ Bot Otomatisasi Dijeda');
      }
    } catch (err) {
      alert(`Error toggling bot: ${err.message}`);
    }
  };

  // Trigger Manual Check
  const handleCheckNow = async () => {
    if (isChecking) return;
    setIsChecking(true);
    showToast('⚡ Memulai pemeriksaan channel...');
    try {
      const res = await fetch('/api/bot/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✓ Selesai: ${data.message || 'Pemrosesan berhasil'}`);
      } else {
        showToast(`⚠️ ${data.message || data.error || 'Pemeriksaan selesai'}`);
      }
      loadStatus();
      loadHistory();
    } catch (err) {
      alert(`Gagal menjalankan pemeriksaan: ${err.message}`);
    } finally {
      setIsChecking(false);
    }
  };

  // Inspect / Preview Channel
  const handlePreviewChannel = async () => {
    if (!channelInput.trim()) return;
    setPreviewLoading(true);
    setPreviewError('');
    setChannelPreview(null);

    try {
      const res = await fetch('/api/bot/channels/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelIdentifier: channelInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setChannelPreview(data);
        if (data.channel?.channelName) {
          setConfig((prev) => ({
            ...prev,
            channelName: data.channel.channelName,
            channelId: data.channel.channelId,
          }));
        }
      } else {
        setPreviewError(data.error || 'Gagal memeriksa channel.');
      }
    } catch (err) {
      setPreviewError(err.message || 'Koneksi gagal.');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Clear History
  const handleClearHistory = async () => {
    if (!window.confirm('Hapus seluruh riwayat video dan log aktivitas bot?')) return;
    try {
      await fetch('/api/bot/history', { method: 'DELETE' });
      setProcessedVideos([]);
      setLogs([]);
      showToast('✓ Riwayat bot dibersihkan.');
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  // Copy Social Metadata
  const handleCopyText = (clip, platform, clipId) => {
    let copy = '';
    if (platform === 'youtube') copy = getYouTubeCopy(clip);
    else if (platform === 'instagram') copy = getInstagramCopy(clip);
    else if (platform === 'tiktok') copy = getTikTokCopy(clip);

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(copy);
      setCopyFeedback({ ...copyFeedback, [`${clipId}_${platform}`]: true });
      setTimeout(() => {
        setCopyFeedback((prev) => ({ ...prev, [`${clipId}_${platform}`]: false }));
      }, 2000);
    }
  };

  const formatDateTime = (str) => {
    if (!str) return 'Belum ada';
    try {
      const d = new Date(str);
      if (isNaN(d.getTime())) return String(str);
      if (!mounted) return d.toISOString().slice(0, 16).replace('T', ' ');
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return String(str);
    }
  };

  const formatDurationSec = (sec) => {
    if (!sec) return '0s';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/" className={styles.logo}>
            <span className={styles.logoMark}>▶</span>
            <span>Arlo Clipper</span>
          </Link>

          <nav className={styles.navLinks}>
            <Link href="/" className={styles.navLink}>
              Home
            </Link>
            <Link href="/library" className={styles.navLink}>
              Library
            </Link>
            <Link href="/bot" className={`${styles.navLink} ${styles.navLinkActive}`}>
              🤖 Auto Bot
            </Link>
          </nav>
        </div>

        <div className={styles.headerRight}>
          <WebhookTriggerButton onClick={() => setIsWebhookModalOpen(true)} />
          <ThemeToggle />
        </div>
      </header>

      {/* Main Container */}
      <main className={styles.main}>
        {/* Status Bar */}
        <section className={styles.statusBar}>
          <div className={styles.statusLeft}>
            <div className={styles.statusIndicator}>
              {isChecking ? '⚡' : isRunning || config.enabled ? '🤖' : '⏸️'}
            </div>
            <div className={styles.statusTitleWrap}>
              <div className={styles.statusHeading}>
                <span>Local Automation Bot</span>
                <span
                  className={`${styles.statusBadge} ${
                    isChecking
                      ? styles.badgeChecking
                      : isRunning || config.enabled
                      ? styles.badgeActive
                      : styles.badgePaused
                  }`}
                >
                  <span className={styles.pulseDot} />
                  {isChecking ? 'Checking & Processing' : isRunning || config.enabled ? 'Active Scheduler' : 'Paused'}
                </span>
              </div>
              <p className={styles.statusSubtitle}>
                {config.enabled
                  ? `Memantau "${config.channelName || config.channelUrl || 'Channel Target'}" secara otomatis setiap ${config.checkIntervalMinutes} menit.`
                  : 'Bot dalam status nonaktif / dijeda. Aktifkan untuk memulai polling otomatis 100% lokal.'}
              </p>
            </div>
          </div>

          <div className={styles.statusRight}>
            <div className={styles.toggleSwitchWrap}>
              <span className={styles.toggleLabel}>{config.enabled ? 'Bot ON' : 'Bot OFF'}</span>
              <button
                type="button"
                className={`${styles.switch} ${config.enabled ? styles.switchOn : ''}`}
                onClick={handleToggleBot}
                aria-label="Toggle Bot Active"
              >
                <span className={styles.switchThumb} />
              </button>
            </div>

            <button
              type="button"
              className={styles.checkNowBtn}
              onClick={handleCheckNow}
              disabled={isChecking}
              title="Periksa video baru & proses klip sekarang juga"
            >
              {isChecking ? '⚡ Sedang Memproses...' : '⚡ Check & Process Now'}
            </button>
          </div>
        </section>

        {/* Metrics Grid */}
        <section className={styles.metricsGrid}>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>🎯 Target Channel</span>
            <span className={styles.metricValue} title={config.channelName || config.channelUrl}>
              {config.channelName || (config.channelUrl ? config.channelUrl.replace(/.*youtube\.com\//, '') : 'Belum Diatur')}
            </span>
            <span className={styles.metricSub}>{config.channelId ? `ID: ${config.channelId}` : 'Konfigurasikan channel di bawah'}</span>
          </div>

          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>⏱️ Interval Polling</span>
            <span className={styles.metricValue}>Setiap {config.checkIntervalMinutes} Menit</span>
            <span className={styles.metricSub}>Next: {formatDateTime(config.nextCheckAt)}</span>
          </div>

          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>🎬 Total Video Diproses</span>
            <span className={styles.metricValue}>{processedVideos.length} Video</span>
            <span className={styles.metricSub}>Last Check: {formatDateTime(config.lastCheckedAt)}</span>
          </div>

          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>✂️ Total Klip Dibuat</span>
            <span className={styles.metricValue}>
              {processedVideos.reduce((acc, v) => acc + (v.clipCount || (v.clips ? v.clips.length : 0)), 0)} Klip
            </span>
            <span className={styles.metricSub}>Tersimpan di Library & Exports</span>
          </div>
        </section>

        {/* Tab Navigation */}
        <div className={styles.tabNav}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'config' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('config')}
          >
            <span>⚙️ Pengaturan Bot & Preset</span>
          </button>

          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'videos' ? styles.tabBtnActive : ''}`}
            onClick={() => {
              setActiveTab('videos');
              loadHistory();
            }}
          >
            <span>🎬 Video Diproses</span>
            <span className={styles.tabCount}>{processedVideos.length}</span>
          </button>

          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'logs' ? styles.tabBtnActive : ''}`}
            onClick={() => {
              setActiveTab('logs');
              loadHistory();
            }}
          >
            <span>📊 Activity Logs</span>
            <span className={styles.tabCount}>{logs.length}</span>
          </button>
        </div>

        {/* Tab 1: Configuration */}
        {activeTab === 'config' && (
          <form onSubmit={handleSaveConfig} className={styles.bentoGrid}>
            {/* Card 1: Target Channel Watcher */}
            <div className={styles.bentoCard}>
              <div className={styles.bentoHeader}>
                <div>
                  <h3 className={styles.bentoTitle}>📺 Target YouTube Channel</h3>
                  <p className={styles.bentoSubtitle}>Channel yang akan dimonitor oleh background scheduler</p>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>URL Channel, Handle (@name), atau Channel ID</label>
                <div className={styles.channelInputRow}>
                  <input
                    type="text"
                    className={styles.inputField}
                    placeholder="e.g. https://www.youtube.com/@mkbhd or @MrBeast or UC..."
                    value={channelInput}
                    onChange={(e) => setChannelInput(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className={styles.previewBtn}
                    onClick={handlePreviewChannel}
                    disabled={previewLoading || !channelInput.trim()}
                  >
                    {previewLoading ? 'Memeriksa...' : '🔍 Preview'}
                  </button>
                </div>
                <span className={styles.formHint}>
                  Mendukung URL Handle, Channel ID, atau link video YouTube.
                </span>
              </div>

              {previewError && (
                <div style={{ color: '#ef4444', fontSize: '0.78rem', background: 'rgba(239,68,68,0.1)', padding: '8px 12px', borderRadius: '4px' }}>
                  ⚠️ {previewError}
                </div>
              )}

              {channelPreview && (
                <div className={styles.channelPreviewBox}>
                  <div className={styles.channelPreviewHeader}>
                    <span className={styles.channelPreviewName}>
                      <span>🟢</span>
                      <span>{channelPreview.channel?.channelName}</span>
                    </span>
                    <span className={styles.channelPreviewId}>{channelPreview.channel?.channelId}</span>
                  </div>

                  <div className={styles.channelVideoPills}>
                    <span style={{ fontSize: '0.72rem', fontWeight: '600', color: 'var(--text-sub)' }}>
                      Video Terbaru di Channel:
                    </span>
                    {channelPreview.videos?.slice(0, 3).map((v) => (
                      <div key={v.videoId} className={styles.channelVideoItem}>
                        <span className={styles.channelVideoTitle}>▶ {v.title}</span>
                        <span className={styles.channelVideoDate}>{formatDateTime(v.publishedAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.presetGrid2}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Interval Pengecekan</label>
                  <select
                    className={styles.inputField}
                    value={config.checkIntervalMinutes}
                    onChange={(e) =>
                      setConfig({ ...config, checkIntervalMinutes: parseInt(e.target.value, 10) })
                    }
                  >
                    <option value={15}>Setiap 15 Menit</option>
                    <option value={30}>Setiap 30 Menit</option>
                    <option value={60}>Setiap 1 Jam (Default)</option>
                    <option value={360}>Setiap 6 Jam</option>
                    <option value={720}>Setiap 12 Jam</option>
                    <option value={1440}>Setiap 24 Jam (1 Hari)</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Maks. Video per Batch</label>
                  <select
                    className={styles.inputField}
                    value={config.maxVideosPerCheck}
                    onChange={(e) =>
                      setConfig({ ...config, maxVideosPerCheck: parseInt(e.target.value, 10) })
                    }
                  >
                    <option value={1}>1 Video Baru Teratas</option>
                    <option value={2}>2 Video Baru</option>
                    <option value={3}>3 Video Baru</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Card 2: Preset Editing & Visuals */}
            <div className={styles.bentoCard}>
              <div className={styles.bentoHeader}>
                <div>
                  <h3 className={styles.bentoTitle}>🎨 Preset Video Editing</h3>
                  <p className={styles.bentoSubtitle}>Pengaturan framing, rasio, dan pemotongan AI otomatis</p>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Rasio Aspek Video</label>
                <div className={styles.segmentedControl}>
                  <button
                    type="button"
                    className={`${styles.segmentBtn} ${
                      config.preset?.ratio === '9:16' ? styles.segmentBtnActive : ''
                    }`}
                    onClick={() =>
                      setConfig({ ...config, preset: { ...config.preset, ratio: '9:16' } })
                    }
                  >
                    📱 9:16 Mobile Vertical
                  </button>
                  <button
                    type="button"
                    className={`${styles.segmentBtn} ${
                      config.preset?.ratio === '16:9' ? styles.segmentBtnActive : ''
                    }`}
                    onClick={() =>
                      setConfig({ ...config, preset: { ...config.preset, ratio: '16:9' } })
                    }
                  >
                    🖥️ 16:9 Landscape
                  </button>
                </div>
              </div>

              <div className={styles.presetGrid2}>
                <label
                  className={`${styles.checkboxCard} ${
                    config.preset?.faceTracking ? styles.checkboxCardActive : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    className={styles.customCheckbox}
                    checked={Boolean(config.preset?.faceTracking)}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        preset: {
                          ...config.preset,
                          faceTracking: e.target.checked,
                          splitScreen: e.target.checked ? false : config.preset.splitScreen,
                        },
                      })
                    }
                  />
                  <div className={styles.checkboxCardText}>
                    <span className={styles.checkboxCardTitle}>Face Tracking (OpenCV)</span>
                    <span className={styles.checkboxCardDesc}>Kamera otomatis mengikuti pergerakan wajah pembicara</span>
                  </div>
                </label>

                <label
                  className={`${styles.checkboxCard} ${
                    config.preset?.splitScreen ? styles.checkboxCardActive : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    className={styles.customCheckbox}
                    checked={Boolean(config.preset?.splitScreen)}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        preset: {
                          ...config.preset,
                          splitScreen: e.target.checked,
                          faceTracking: e.target.checked ? false : config.preset.faceTracking,
                        },
                      })
                    }
                  />
                  <div className={styles.checkboxCardText}>
                    <span className={styles.checkboxCardTitle}>Podcast Split Screen</span>
                    <span className={styles.checkboxCardDesc}>Framing atas-bawah untuk podcast 2 orang</span>
                  </div>
                </label>
              </div>

              <div className={styles.presetGrid2}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Maks. Klip per Video</label>
                  <select
                    className={styles.inputField}
                    value={config.maxClipsPerVideo}
                    onChange={(e) =>
                      setConfig({ ...config, maxClipsPerVideo: parseInt(e.target.value, 10) })
                    }
                  >
                    <option value={1}>1 Klip Terbaik</option>
                    <option value={2}>2 Klip Viral</option>
                    <option value={3}>3 Klip (Rekomendasi)</option>
                    <option value={4}>4 Klip</option>
                    <option value={5}>5 Klip</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Auto B-Roll Overlay</label>
                  <select
                    className={styles.inputField}
                    value={config.preset?.broll || 'auto'}
                    onChange={(e) =>
                      setConfig({ ...config, preset: { ...config.preset, broll: e.target.value } })
                    }
                  >
                    <option value="auto">Auto AI Contextual</option>
                    <option value="tech">Tech & AI Visuals</option>
                    <option value="gaming">Gaming & Neon</option>
                    <option value="finance">Finance & Crypto</option>
                    <option value="nature">Nature & Cinematic</option>
                    <option value="none">Tanpa B-Roll (None)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Card 3: Subtitles & Audio Ducking */}
            <div className={styles.bentoCard}>
              <div className={styles.bentoHeader}>
                <div>
                  <h3 className={styles.bentoTitle}>💬 Subtitle & Voice AI</h3>
                  <p className={styles.bentoSubtitle}>Transkripsi Groq Whisper & efek subtitle karaoke dinamis</p>
                </div>
              </div>

              <div className={styles.presetGrid3}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Animasi Subtitle</label>
                  <select
                    className={styles.inputField}
                    value={config.preset?.subtitleAnimation || 'Pop'}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        preset: {
                          ...config.preset,
                          subtitleAnimation: e.target.value,
                          subtitles: e.target.value !== 'None',
                        },
                      })
                    }
                  >
                    <option value="Pop">Pop (Shorts Style)</option>
                    <option value="Karaoke">Karaoke Word Highlight</option>
                    <option value="Classic">Classic Caption</option>
                    <option value="None">Tanpa Subtitle</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Font Family</label>
                  <select
                    className={styles.inputField}
                    value={config.preset?.font || 'Impact'}
                    onChange={(e) =>
                      setConfig({ ...config, preset: { ...config.preset, font: e.target.value } })
                    }
                  >
                    <option value="Impact">Impact (Bold)</option>
                    <option value="Inter">Inter</option>
                    <option value="Montserrat">Montserrat</option>
                    <option value="Roboto">Roboto</option>
                    <option value="Bangers">Bangers</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Ukuran Subtitle</label>
                  <select
                    className={styles.inputField}
                    value={config.preset?.fontSize || 'Medium'}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        preset: { ...config.preset, fontSize: e.target.value },
                      })
                    }
                  >
                    <option value="Small">Small</option>
                    <option value="Medium">Medium (Recommended)</option>
                    <option value="Large">Large</option>
                  </select>
                </div>
              </div>

              <div className={styles.presetGrid2}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Background Music (BGM)</label>
                  <select
                    className={styles.inputField}
                    value={config.preset?.bgm || 'upbeat-energetic'}
                    onChange={(e) =>
                      setConfig({ ...config, preset: { ...config.preset, bgm: e.target.value } })
                    }
                  >
                    <option value="upbeat-energetic">⚡ Upbeat & Energetic</option>
                    <option value="chill-lofi">☕ Chill & Lofi</option>
                    <option value="dramatic-suspense">🔥 Dramatic Suspense</option>
                    <option value="none">Tanpa BGM (Mute BGM)</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Voice Ducking</label>
                  <select
                    className={styles.inputField}
                    value={config.preset?.ducking || 'medium'}
                    onChange={(e) =>
                      setConfig({ ...config, preset: { ...config.preset, ducking: e.target.value } })
                    }
                  >
                    <option value="light">Light Ducking (-6dB)</option>
                    <option value="medium">Medium Ducking (-14dB)</option>
                    <option value="heavy">Heavy Ducking (-22dB)</option>
                    <option value="none">No Ducking</option>
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label
                  className={`${styles.checkboxCard} ${
                    config.preset?.sfx !== false ? styles.checkboxCardActive : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    className={styles.customCheckbox}
                    checked={config.preset?.sfx !== false}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        preset: {
                          ...config.preset,
                          sfx: e.target.checked,
                        },
                      })
                    }
                  />
                  <div className={styles.checkboxCardText}>
                    <span className={styles.checkboxCardTitle}>Sound Effects (SFX) Transisi</span>
                    <span className={styles.checkboxCardDesc}>
                      Otomatis menambahkan efek suara transisi (whoosh, pop, ding) pada hook viral
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Card 4: Auto Export & Social Metadata Generator */}
            <div className={styles.bentoCard}>
              <div className={styles.bentoHeader}>
                <div>
                  <h3 className={styles.bentoTitle}>📁 Ekspor & Metadata Generator</h3>
                  <p className={styles.bentoSubtitle}>Penyimpanan lokal dan pembuatan file metadata copy otomatis</p>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label
                  className={`${styles.checkboxCard} ${
                    config.exportSettings?.autoExport ? styles.checkboxCardActive : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    className={styles.customCheckbox}
                    checked={Boolean(config.exportSettings?.autoExport)}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        exportSettings: {
                          ...config.exportSettings,
                          autoExport: e.target.checked,
                        },
                      })
                    }
                  />
                  <div className={styles.checkboxCardText}>
                    <span className={styles.checkboxCardTitle}>Simpan File ke Direktori Ekspor Lokal</span>
                    <span className={styles.checkboxCardDesc}>
                      Menyimpan klip MP4 final ke folder ekspor proyek untuk siap upload
                    </span>
                  </div>
                </label>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Nama Folder Ekspor</label>
                <input
                  type="text"
                  className={styles.inputField}
                  value={config.exportSettings?.exportDir || 'exports'}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      exportSettings: {
                        ...config.exportSettings,
                        exportDir: e.target.value,
                      },
                    })
                  }
                />
              </div>

              <div className={styles.presetGrid2}>
                <label className={styles.checkboxCard}>
                  <input
                    type="checkbox"
                    className={styles.customCheckbox}
                    checked={Boolean(config.exportSettings?.generateTxtMetadata)}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        exportSettings: {
                          ...config.exportSettings,
                          generateTxtMetadata: e.target.checked,
                        },
                      })
                    }
                  />
                  <div className={styles.checkboxCardText}>
                    <span className={styles.checkboxCardTitle}>File TXT Social Copy</span>
                    <span className={styles.checkboxCardDesc}>
                      Format siap paste YouTube Shorts, Reels, TikTok
                    </span>
                  </div>
                </label>

                <label className={styles.checkboxCard}>
                  <input
                    type="checkbox"
                    className={styles.customCheckbox}
                    checked={Boolean(config.exportSettings?.generateJsonMetadata)}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        exportSettings: {
                          ...config.exportSettings,
                          generateJsonMetadata: e.target.checked,
                        },
                      })
                    }
                  />
                  <div className={styles.checkboxCardText}>
                    <span className={styles.checkboxCardTitle}>File JSON Metadata</span>
                    <span className={styles.checkboxCardDesc}>
                      Data terstruktur untuk bot uploader / integrasi
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Save Button Row */}
            <div className={styles.saveFooter}>
              {toastMessage && <span className={styles.saveToast}>{toastMessage}</span>}
              <button
                type="submit"
                className={styles.saveBtn}
                disabled={savingConfig}
              >
                {savingConfig ? 'Menyimpan...' : '💾 Simpan Konfigurasi Bot'}
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Processed Videos */}
        {activeTab === 'videos' && (
          <div>
            {processedVideos.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>🎬</div>
                <h3 className={styles.emptyTitle}>Belum Ada Video yang Diproses</h3>
                <p className={styles.emptyDesc}>
                  Bot akan otomatis memproses video baru saat channel merilis konten baru, atau klik tombol
                  &ldquo;⚡ Check & Process Now&rdquo; untuk memproses video pertama.
                </p>
                <button
                  type="button"
                  className={styles.checkNowBtn}
                  onClick={handleCheckNow}
                  disabled={isChecking}
                >
                  ⚡ Check & Process Now
                </button>
              </div>
            ) : (
              <div className={styles.videoCardList}>
                {processedVideos.map((video) => (
                  <div key={video.id || video.videoId} className={styles.videoCard}>
                    <div className={styles.videoCardHeader}>
                      <div className={styles.videoCardLeft}>
                        <span className={styles.videoStatusIcon}>
                          {video.status === 'success' ? '✅' : '❌'}
                        </span>
                        <div className={styles.videoInfo}>
                          <h4 className={styles.videoTitle}>{video.videoTitle}</h4>
                          <div className={styles.videoMeta}>
                            <span>👤 {video.channelName}</span>
                            <span>📅 Diproses: {formatDateTime(video.processedAt)}</span>
                            <span>✂️ {video.clipCount || (video.clips ? video.clips.length : 0)} Klip</span>
                          </div>
                        </div>
                      </div>

                      <div className={styles.videoCardActions}>
                        {video.videoUrl && (
                          <a
                            href={video.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.actionBtnSmall}
                          >
                            <span>↗️ YouTube Video</span>
                          </a>
                        )}
                        <Link href="/library" className={styles.actionBtnSmall}>
                          <span>📚 Buka di Library</span>
                        </Link>
                      </div>
                    </div>

                    {/* Clips Container */}
                    {Array.isArray(video.clips) && video.clips.length > 0 && (
                      <div className={styles.clipsListContainer}>
                        {video.clips.map((clip, idx) => {
                          const clipKey = clip.id || clip.clipId || `${video.videoId}_${idx}`;
                          return (
                            <div key={clipKey} className={styles.clipItemCard}>
                              <div className={styles.clipItemHeader}>
                                <span className={styles.clipItemTitle}>{clip.title || `Clip ${idx + 1}`}</span>
                                <span className={styles.clipDurationBadge}>
                                  {formatDurationSec(clip.duration)}
                                </span>
                              </div>

                              {clip.hook && (
                                <div className={styles.clipHookBox}>
                                  🔥 &ldquo;{clip.hook}&rdquo;
                                </div>
                              )}

                              {(clip.videoUrl || clip.videoPath) && (
                                <video
                                  src={clip.videoUrl || clip.videoPath}
                                  controls
                                  preload="metadata"
                                  className={styles.clipVideoPlayer}
                                />
                              )}

                              {/* Copy Caption Group */}
                              <div className={styles.clipCopyButtonGroup}>
                                <button
                                  type="button"
                                  className={styles.clipCopyBtn}
                                  onClick={() => handleCopyText(clip, 'youtube', clipKey)}
                                  title="Copy YouTube Shorts Caption & Hashtags"
                                >
                                  <span>🔴</span>
                                  <span>{copyFeedback[`${clipKey}_youtube`] ? '✓ Copied' : 'Shorts'}</span>
                                </button>

                                <button
                                  type="button"
                                  className={styles.clipCopyBtn}
                                  onClick={() => handleCopyText(clip, 'instagram', clipKey)}
                                  title="Copy Instagram Reels Caption & Hashtags"
                                >
                                  <span>📸</span>
                                  <span>{copyFeedback[`${clipKey}_instagram`] ? '✓ Copied' : 'Reels'}</span>
                                </button>

                                <button
                                  type="button"
                                  className={styles.clipCopyBtn}
                                  onClick={() => handleCopyText(clip, 'tiktok', clipKey)}
                                  title="Copy TikTok Caption & Hashtags"
                                >
                                  <span>🎵</span>
                                  <span>{copyFeedback[`${clipKey}_tiktok`] ? '✓ Copied' : 'TikTok'}</span>
                                </button>
                              </div>

                              {/* Download Links */}
                              <div className={styles.clipDownloadRow}>
                                {(clip.videoUrl || clip.videoPath) && (
                                  <a
                                    href={clip.videoUrl || clip.videoPath}
                                    download={`${(clip.title || 'clip').replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`}
                                    className={styles.clipDownloadLink}
                                  >
                                    ⬇️ MP4
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Activity Logs */}
        {activeTab === 'logs' && (
          <div>
            <div className={styles.logsHeader}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>
                {logs.length} riwayat aktivitas scheduler & execution
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={loadHistory} className={styles.actionBtnSmall}>
                  🔄 Refresh Logs
                </button>
                {logs.length > 0 && (
                  <button type="button" onClick={handleClearHistory} className={styles.actionBtnSmall}>
                    🗑️ Clear Logs
                  </button>
                )}
              </div>
            </div>

            {logs.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📊</div>
                <h3 className={styles.emptyTitle}>Belum Ada Log Aktivitas</h3>
                <p className={styles.emptyDesc}>Log eksekusi bot scheduler akan muncul di sini secara real-time.</p>
              </div>
            ) : (
              <div className={styles.logsList}>
                {logs.map((log) => (
                  <div key={log.id || log.timestamp} className={styles.logCard}>
                    <div className={styles.logTop}>
                      <span className={`${styles.logLevelBadge} ${styles[`logLevel_${log.level}`] || ''}`}>
                        {log.level || 'INFO'}
                      </span>
                      <span className={styles.logTimestamp}>{formatDateTime(log.timestamp)}</span>
                    </div>
                    <div className={styles.logMessage}>{log.message}</div>
                    {log.details && (
                      <pre className={styles.logDetails}>{JSON.stringify(log.details, null, 2)}</pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Webhook Settings Modal */}
      <WebhookModal
        isOpen={isWebhookModalOpen}
        onClose={() => setIsWebhookModalOpen(false)}
      />
    </div>
  );
}
