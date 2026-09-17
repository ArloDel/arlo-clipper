'use client';

import React, { useState, useEffect } from 'react';
import { getYouTubeCopy, getInstagramCopy, getTikTokCopy, formatHashtags } from '@/lib/socialCopy';
import styles from './DirectPublishModal.module.css';

export function DirectPublishTriggerButton({ onClick, label = 'Direct Publish', size = 'medium' }) {
  return (
    <button
      type="button"
      className={styles.triggerButton}
      onClick={onClick}
      title="Direct Auto-Publish ke YouTube Shorts, TikTok, Instagram Reels"
    >
      <span>🚀</span>
      <span>{label}</span>
    </button>
  );
}

export default function DirectPublishModal({ isOpen, onClose, clip, onPublished }) {
  const [activeTab, setActiveTab] = useState('publish'); // 'publish' | 'settings'

  // Publishing form state
  const [selectedPlatforms, setSelectedPlatforms] = useState(['youtube']);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtagsStr, setHashtagsStr] = useState('');
  const [privacy, setPrivacy] = useState('public'); // 'public' | 'draft' | 'scheduled'
  const [scheduleTime, setScheduleTime] = useState('');

  // Status & Connection Config
  const [socialConfig, setSocialConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState('');
  const [publishResult, setPublishResult] = useState(null);
  const [publishError, setPublishError] = useState('');

  // Settings form state
  const [settingsForm, setSettingsForm] = useState({
    youtube: { clientId: '', clientSecret: '', refreshToken: '', accessToken: '', defaultPrivacy: 'public' },
    tiktok: { clientKey: '', clientSecret: '', accessToken: '', defaultPrivacy: 'PUBLIC_TO_EVERYONE', disableDuet: false, disableStitch: false, disableComment: false },
    instagram: { accessToken: '', instagramAccountId: '', shareToFeed: true },
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');

  // Load social config whenever modal opens
  useEffect(() => {
    if (!isOpen) return;

    async function loadConfig() {
      setLoadingConfig(true);
      try {
        const res = await fetch('/api/publish/config');
        if (res.ok) {
          const data = await res.json();
          if (data.config) {
            setSocialConfig(data.config);
            setSettingsForm({
              youtube: { ...data.config.youtube },
              tiktok: { ...data.config.tiktok },
              instagram: { ...data.config.instagram },
            });
          }
        }
      } catch (err) {
        console.warn('Failed to load social config:', err);
      } finally {
        setLoadingConfig(false);
      }
    }

    loadConfig();
  }, [isOpen]);

  // Sync form when clip changes
  const [prevClipId, setPrevClipId] = useState(null);
  if (clip && clip.id !== prevClipId) {
    setPrevClipId(clip.id);
    setTitle(clip.title || clip.hook || 'Untitled Viral Clip');
    setCaption(getYouTubeCopy(clip));
    const tags = Array.isArray(clip.hashtags)
      ? clip.hashtags.join(' ')
      : (clip.hashtags || '#Shorts #Viral #Trending');
    setHashtagsStr(tags);
    setPublishResult(null);
    setPublishError('');
  }

  if (!isOpen || !clip) return null;

  const togglePlatform = (p) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((item) => item !== p) : [...prev, p]
    );
  };

  const applyTemplate = (platform) => {
    if (platform === 'youtube') {
      setCaption(getYouTubeCopy(clip));
    } else if (platform === 'instagram') {
      setCaption(getInstagramCopy(clip));
    } else if (platform === 'tiktok') {
      setCaption(getTikTokCopy(clip));
    }
  };

  const handlePublish = async (e) => {
    if (e) e.preventDefault();
    if (selectedPlatforms.length === 0) {
      alert('Pilih setidaknya satu platform medsos tujuan upload.');
      return;
    }

    if (privacy === 'scheduled' && !scheduleTime) {
      alert('Pilih tanggal dan jam tayang terlebih dahulu untuk menjadwalkan posting.');
      return;
    }

    setPublishing(true);
    setPublishError('');
    setPublishResult(null);
    setPublishProgress('Menyiapkan media dan metadata upload...');

    try {
      const parsedTags = hashtagsStr
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean);

      const payload = {
        clipId: clip.id || clip.clipId,
        clip,
        videoPath: clip.videoPath || clip.videoUrl,
        videoUrl: clip.videoUrl,
        platforms: selectedPlatforms,
        privacy: privacy === 'draft' ? 'unlisted' : privacy === 'scheduled' ? 'private' : 'public',
        scheduleTime: privacy === 'scheduled' && scheduleTime ? new Date(scheduleTime).toISOString() : null,
        customTitle: title.trim(),
        customCaption: caption.trim(),
        customHashtags: parsedTags,
      };

      setPublishProgress(`Mengunggah video ke ${selectedPlatforms.join(', ')}...`);

      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setPublishResult(data);
        if (onPublished) onPublished(data);
      } else {
        setPublishError(data.error || data.details || 'Gagal mengunggah ke medsos.');
      }
    } catch (err) {
      setPublishError(`Error: ${err.message}`);
    } finally {
      setPublishing(false);
      setPublishProgress('');
    }
  };

  const handleSaveSettings = async (e) => {
    if (e) e.preventDefault();
    setSavingSettings(true);
    setSettingsMessage('');
    try {
      const res = await fetch('/api/publish/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm),
      });
      const data = await res.json();
      if (res.ok) {
        setSocialConfig(data.config);
        setSettingsMessage('✓ Konfigurasi medsos berhasil disimpan!');
        setTimeout(() => setSettingsMessage(''), 3000);
      } else {
        alert(`Gagal menyimpan: ${data.error || 'Terjadi kesalahan'}`);
      }
    } catch (err) {
      alert(`Error saving settings: ${err.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>🚀</div>
            <div>
              <h2 className={styles.title}>Direct Auto-Publish ke Medsos</h2>
              <p className={styles.subtitle}>
                Upload langsung klip vertikal ke YouTube Shorts, TikTok, dan Instagram Reels
              </p>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Modal Tabs */}
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'publish' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('publish')}
          >
            <span>🚀 Publish Now</span>
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'settings' ? styles.tabBtnActiveSettings : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <span>⚙️ Account & API Settings</span>
          </button>
        </div>

        {/* TAB 1: DIRECT PUBLISH */}
        {activeTab === 'publish' && (
          <div className={styles.content}>
            {/* Target Platforms Picker */}
            <div className={styles.platformSection}>
              <span className={styles.sectionLabel}>Pilih Target Platform Medsos</span>
              <div className={styles.platformGrid}>
                {/* YouTube Shorts */}
                <div
                  className={`${styles.platformCard} ${
                    selectedPlatforms.includes('youtube') ? styles.platformCardSelected : ''
                  }`}
                  onClick={() => togglePlatform('youtube')}
                >
                  <div className={styles.platformTop}>
                    <div className={styles.platformInfo}>
                      <span className={styles.platformIcon}>🔴</span>
                      <span className={styles.platformName}>YouTube Shorts</span>
                    </div>
                    <input
                      type="checkbox"
                      className={styles.checkboxInput}
                      checked={selectedPlatforms.includes('youtube')}
                      onChange={() => togglePlatform('youtube')}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div>
                    <span
                      className={`${styles.statusBadge} ${
                        socialConfig?.youtube?.isConfigured ? styles.badgeConnected : styles.badgeUnlinked
                      }`}
                    >
                      {socialConfig?.youtube?.isConfigured ? '🟢 Connected / API Ready' : '⚪ Sandbox / Mock Mode'}
                    </span>
                  </div>
                </div>

                {/* TikTok */}
                <div
                  className={`${styles.platformCard} ${
                    selectedPlatforms.includes('tiktok') ? styles.platformCardSelectedTikTok : ''
                  }`}
                  onClick={() => togglePlatform('tiktok')}
                >
                  <div className={styles.platformTop}>
                    <div className={styles.platformInfo}>
                      <span className={styles.platformIcon}>🎵</span>
                      <span className={styles.platformName}>TikTok</span>
                    </div>
                    <input
                      type="checkbox"
                      className={styles.checkboxInput}
                      checked={selectedPlatforms.includes('tiktok')}
                      onChange={() => togglePlatform('tiktok')}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div>
                    <span
                      className={`${styles.statusBadge} ${
                        socialConfig?.tiktok?.isConfigured ? styles.badgeConnected : styles.badgeUnlinked
                      }`}
                    >
                      {socialConfig?.tiktok?.isConfigured ? '🟢 Connected' : '⚪ Sandbox / Mock Mode'}
                    </span>
                  </div>
                </div>

                {/* Instagram Reels */}
                <div
                  className={`${styles.platformCard} ${
                    selectedPlatforms.includes('instagram') ? styles.platformCardSelectedIG : ''
                  }`}
                  onClick={() => togglePlatform('instagram')}
                >
                  <div className={styles.platformTop}>
                    <div className={styles.platformInfo}>
                      <span className={styles.platformIcon}>📸</span>
                      <span className={styles.platformName}>Instagram Reels</span>
                    </div>
                    <input
                      type="checkbox"
                      className={styles.checkboxInput}
                      checked={selectedPlatforms.includes('instagram')}
                      onChange={() => togglePlatform('instagram')}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div>
                    <span
                      className={`${styles.statusBadge} ${
                        socialConfig?.instagram?.isConfigured ? styles.badgeConnected : styles.badgeUnlinked
                      }`}
                    >
                      {socialConfig?.instagram?.isConfigured ? '🟢 Connected' : '⚪ Sandbox / Mock Mode'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Video Preview & Content Editor */}
            <div className={styles.editorColumns}>
              {/* Left: Video Preview & Metadata Pill */}
              <div className={styles.previewSide}>
                {(clip.videoPath || clip.videoUrl) && (
                  <video
                    src={clip.videoPath || clip.videoUrl}
                    controls
                    preload="metadata"
                    className={styles.videoPreview}
                  />
                )}
                <div className={styles.clipMetaPill}>
                  <span>⏱️ Durasi: {Math.round(clip.duration || 0)}s</span>
                  {clip.channelName && <span>👤 Channel: @{clip.channelName}</span>}
                  {clip.startTime && <span>📍 Timestamp: {clip.startTime} - {clip.endTime}</span>}
                </div>
              </div>

              {/* Right: Title, Caption, Hashtags */}
              <div className={styles.formSide}>
                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>
                    <span>Judul Klip (Title)</span>
                    <span style={{ fontSize: '0.7rem' }}>{title.length}/100</span>
                  </label>
                  <input
                    type="text"
                    className={styles.inputField}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Judul klip yang memikat penonton..."
                    maxLength={100}
                    required
                  />
                </div>

                <div className={styles.inputGroup}>
                  <div className={styles.inputLabel}>
                    <span>Deskripsi / Caption</span>
                    <div className={styles.copyTemplatesRow}>
                      <button
                        type="button"
                        className={styles.templateBtn}
                        onClick={() => applyTemplate('youtube')}
                        title="Terapkan template YouTube Shorts"
                      >
                        🔴 Shorts
                      </button>
                      <button
                        type="button"
                        className={styles.templateBtn}
                        onClick={() => applyTemplate('instagram')}
                        title="Terapkan template Reels"
                      >
                        📸 Reels
                      </button>
                      <button
                        type="button"
                        className={styles.templateBtn}
                        onClick={() => applyTemplate('tiktok')}
                        title="Terapkan template TikTok"
                      >
                        🎵 TikTok
                      </button>
                    </div>
                  </div>
                  <textarea
                    className={styles.textareaField}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Tuliskan caption, credit source, dan deskripsi..."
                    rows={4}
                  />
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>Hashtags</label>
                  <input
                    type="text"
                    className={styles.inputField}
                    value={hashtagsStr}
                    onChange={(e) => setHashtagsStr(e.target.value)}
                    placeholder="#Shorts #Viral #Trending #Podcast"
                  />
                </div>
              </div>
            </div>

            {/* Privacy & Scheduling Options */}
            <div className={styles.privacySection}>
              <span className={styles.sectionLabel}>Status Publikasi</span>
              <div className={styles.privacyOptionsGrid}>
                <button
                  type="button"
                  className={`${styles.privacyOptionBtn} ${
                    privacy === 'public' ? styles.privacyOptionBtnActive : ''
                  }`}
                  onClick={() => setPrivacy('public')}
                >
                  <span className={styles.privacyBtnIcon}>🌐</span>
                  <span className={styles.privacyBtnTitle}>Publish Now (Public)</span>
                </button>

                <button
                  type="button"
                  className={`${styles.privacyOptionBtn} ${
                    privacy === 'draft' ? styles.privacyOptionBtnActive : ''
                  }`}
                  onClick={() => setPrivacy('draft')}
                >
                  <span className={styles.privacyBtnIcon}>🔒</span>
                  <span className={styles.privacyBtnTitle}>Draft / Unlisted</span>
                </button>

                <button
                  type="button"
                  className={`${styles.privacyOptionBtn} ${
                    privacy === 'scheduled' ? styles.privacyOptionBtnActive : ''
                  }`}
                  onClick={() => setPrivacy('scheduled')}
                >
                  <span className={styles.privacyBtnIcon}>⏰</span>
                  <span className={styles.privacyBtnTitle}>Schedule Publish</span>
                </button>
              </div>

              {privacy === 'scheduled' && (
                <div className={styles.scheduleInputRow}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-sub)' }}>Waktu Tayang:</span>
                  <input
                    type="datetime-local"
                    className={styles.datetimeInput}
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    required={privacy === 'scheduled'}
                  />
                </div>
              )}
            </div>

            {/* Result Feedback Banner */}
            {publishResult && (
              <div className={styles.resultBannerSuccess}>
                <div className={styles.resultTitle}>
                  <span>✓ Berhasil Dipublikasikan!</span>
                </div>
                <div className={styles.resultLinksGrid}>
                  {publishResult.results?.youtube && publishResult.results.youtube.videoUrl && (
                    <a
                      href={publishResult.results.youtube.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.resultLinkBtn}
                    >
                      <span>🔴 Buka YouTube Shorts ↗</span>
                    </a>
                  )}
                  {publishResult.results?.tiktok && (
                    <span className={styles.resultLinkBtn} style={{ background: 'rgba(6, 182, 212, 0.2)', color: '#67e8f9', borderColor: 'rgba(6, 182, 212, 0.4)' }}>
                      <span>🎵 TikTok Status: {publishResult.results.tiktok.status || 'Submitted'}</span>
                    </span>
                  )}
                  {publishResult.results?.instagram && (
                    <a
                      href={publishResult.results.instagram.postUrl || 'https://instagram.com'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.resultLinkBtn}
                      style={{ background: 'rgba(236, 72, 153, 0.2)', color: '#f472b6', borderColor: 'rgba(236, 72, 153, 0.4)' }}
                    >
                      <span>📸 Buka Instagram Reels ↗</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            {publishError && (
              <div className={styles.resultBannerError}>
                <span>⚠️ {publishError}</span>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MEDSOS ACCOUNTS & API SETTINGS */}
        {activeTab === 'settings' && (
          <form onSubmit={handleSaveSettings} className={styles.content}>
            {settingsMessage && (
              <div style={{ color: '#10b981', fontSize: '0.82rem', fontWeight: '600', textAlign: 'center' }}>
                {settingsMessage}
              </div>
            )}

            {/* YouTube Data API Config */}
            <div className={styles.settingsCard}>
              <div className={styles.settingsCardTitle}>
                <span>🔴 YouTube Data API v3 (Shorts Direct Upload)</span>
                <span className={`${styles.statusBadge} ${socialConfig?.youtube?.isConfigured ? styles.badgeConnected : styles.badgeUnlinked}`}>
                  {socialConfig?.youtube?.isConfigured ? 'Configured' : 'Not Set'}
                </span>
              </div>
              <div className={styles.settingsInputsGrid}>
                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>OAuth Client ID</label>
                  <input
                    type="text"
                    className={styles.inputField}
                    placeholder="e.g. 12345-xxx.apps.googleusercontent.com"
                    value={settingsForm.youtube.clientId || ''}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        youtube: { ...settingsForm.youtube, clientId: e.target.value },
                      })
                    }
                  />
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>OAuth Client Secret</label>
                  <input
                    type="password"
                    className={styles.inputField}
                    placeholder="GOCSPX-xxx"
                    value={settingsForm.youtube.clientSecret || ''}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        youtube: { ...settingsForm.youtube, clientSecret: e.target.value },
                      })
                    }
                  />
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>OAuth Refresh Token</label>
                  <input
                    type="password"
                    className={styles.inputField}
                    placeholder="1//04xxx"
                    value={settingsForm.youtube.refreshToken || ''}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        youtube: { ...settingsForm.youtube, refreshToken: e.target.value },
                      })
                    }
                  />
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>Default Privacy Status</label>
                  <select
                    className={styles.inputField}
                    value={settingsForm.youtube.defaultPrivacy || 'public'}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        youtube: { ...settingsForm.youtube, defaultPrivacy: e.target.value },
                      })
                    }
                  >
                    <option value="public">Public</option>
                    <option value="unlisted">Unlisted / Draft</option>
                    <option value="private">Private</option>
                  </select>
                </div>
              </div>
            </div>

            {/* TikTok Content Posting API Config */}
            <div className={styles.settingsCard}>
              <div className={styles.settingsCardTitle}>
                <span>🎵 TikTok Content Posting API v2</span>
                <span className={`${styles.statusBadge} ${socialConfig?.tiktok?.isConfigured ? styles.badgeConnected : styles.badgeUnlinked}`}>
                  {socialConfig?.tiktok?.isConfigured ? 'Configured' : 'Not Set'}
                </span>
              </div>
              <div className={styles.settingsInputsGrid}>
                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>Client Key</label>
                  <input
                    type="text"
                    className={styles.inputField}
                    placeholder="awxxxx"
                    value={settingsForm.tiktok.clientKey || ''}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        tiktok: { ...settingsForm.tiktok, clientKey: e.target.value },
                      })
                    }
                  />
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>Access Token</label>
                  <input
                    type="password"
                    className={styles.inputField}
                    placeholder="act.xxxx"
                    value={settingsForm.tiktok.accessToken || ''}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        tiktok: { ...settingsForm.tiktok, accessToken: e.target.value },
                      })
                    }
                  />
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>Default Privacy Level</label>
                  <select
                    className={styles.inputField}
                    value={settingsForm.tiktok.defaultPrivacy || 'PUBLIC_TO_EVERYONE'}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        tiktok: { ...settingsForm.tiktok, defaultPrivacy: e.target.value },
                      })
                    }
                  >
                    <option value="PUBLIC_TO_EVERYONE">Public to Everyone</option>
                    <option value="MUTUAL_FOLLOW_FRIENDS">Friends Only</option>
                    <option value="SELF_ONLY">Private (Self Only)</option>
                  </select>
                </div>

                <div className={styles.inputGroup} style={{ justifyContent: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(settingsForm.tiktok.disableComment)}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          tiktok: { ...settingsForm.tiktok, disableComment: e.target.checked },
                        })
                      }
                    />
                    <span>Disable Comments</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Instagram Graph API Config */}
            <div className={styles.settingsCard}>
              <div className={styles.settingsCardTitle}>
                <span>📸 Instagram Graph API (Reels Direct Publishing)</span>
                <span className={`${styles.statusBadge} ${socialConfig?.instagram?.isConfigured ? styles.badgeConnected : styles.badgeUnlinked}`}>
                  {socialConfig?.instagram?.isConfigured ? 'Configured' : 'Not Set'}
                </span>
              </div>
              <div className={styles.settingsInputsGrid}>
                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>Instagram Business / Creator Account ID</label>
                  <input
                    type="text"
                    className={styles.inputField}
                    placeholder="17841400..."
                    value={settingsForm.instagram.instagramAccountId || ''}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        instagram: { ...settingsForm.instagram, instagramAccountId: e.target.value },
                      })
                    }
                  />
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>User / Page Access Token</label>
                  <input
                    type="password"
                    className={styles.inputField}
                    placeholder="EAAB..."
                    value={settingsForm.instagram.accessToken || ''}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        instagram: { ...settingsForm.instagram, accessToken: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
              <button type="submit" className={styles.saveSettingsBtn} disabled={savingSettings}>
                {savingSettings ? 'Menyimpan...' : '💾 Simpan Kredensial Medsos'}
              </button>
            </div>
          </form>
        )}

        {/* Modal Footer */}
        {activeTab === 'publish' && (
          <div className={styles.footer}>
            <div className={styles.footerStatus}>
              {publishing ? (
                <span>⏳ {publishProgress}</span>
              ) : (
                <span>Target: {selectedPlatforms.length} platform dipilih</span>
              )}
            </div>
            <button
              type="button"
              className={styles.publishActionBtn}
              onClick={handlePublish}
              disabled={publishing || selectedPlatforms.length === 0}
            >
              <span>{publishing ? '⏳ Mengunggah...' : '🚀 Publish Now'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
