'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import ThemeToggle from '../components/ThemeToggle';
import { getYouTubeCopy, getInstagramCopy, getTikTokCopy } from '../../lib/socialCopy';
import styles from './library.module.css';

export default function LibraryPage() {
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  // Selection state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);

  // Social Copy Modal state
  const [activeModalClip, setActiveModalClip] = useState(null);
  const [modalCopyStatus, setModalCopyStatus] = useState('');

  useEffect(() => {
    let ignore = false;

    async function loadClips() {
      try {
        const response = await fetch(`/api/clips?page=${currentPage}&limit=9`);
        if (response.ok) {
          const data = await response.json();
          if (!ignore) {
            setClips(data.clips || []);
            setTotalPages(data.totalPages || 1);
            if (currentPage > data.totalPages && data.totalPages > 0) {
              setCurrentPage(data.totalPages);
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch clips:', error);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadClips();
    return () => {
      ignore = true;
    };
  }, [currentPage, refreshKey]);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this clip?')) {
      return;
    }

    try {
      const response = await fetch(`/api/clips/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setLoading(true);
        setRefreshKey((k) => k + 1);
      } else {
        console.error('Failed to delete clip');
      }
    } catch (error) {
      console.error('Error deleting clip:', error);
    }
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedIds([]);
  };

  const toggleSelectClip = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((selectedId) => selectedId !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedIds.length === clips.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(clips.map((c) => c.id));
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.length} selected clips?`)) {
      return;
    }

    setIsProcessingBulk(true);
    try {
      const response = await fetch('/api/clips/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });

      if (response.ok) {
        setSelectedIds([]);
        setIsSelectionMode(false);
        setLoading(true);
        setRefreshKey((k) => k + 1);
      } else {
        console.error('Failed to bulk delete');
      }
    } catch (error) {
      console.error('Error in bulk delete:', error);
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleBulkDownload = async () => {
    setIsProcessingBulk(true);
    try {
      const response = await fetch('/api/clips/bulk/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Arlo-Clips.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        setSelectedIds([]);
        setIsSelectionMode(false);
      } else {
        console.error('Failed to bulk download');
      }
    } catch (error) {
      console.error('Error in bulk download:', error);
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleModalCopy = (platform) => {
    if (!activeModalClip) return;
    let text = '';
    if (platform === 'youtube') text = getYouTubeCopy(activeModalClip);
    else if (platform === 'instagram') text = getInstagramCopy(activeModalClip);
    else if (platform === 'tiktok') text = getTikTokCopy(activeModalClip);

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setModalCopyStatus(`Tersalin untuk ${platform === 'youtube' ? 'YouTube Shorts' : platform === 'instagram' ? 'Instagram Reels' : 'TikTok'}!`);
      setTimeout(() => setModalCopyStatus(''), 2500);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/" className={styles.backLink}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Home
          </Link>
          <h1 className={styles.title}>My Library</h1>
        </div>

        <div className={styles.headerRight}>
          <ThemeToggle />
          {clips.length > 0 && (
            <button
              className={`${styles.selectModeBtn} ${isSelectionMode ? styles.selectModeActive : ''}`}
              onClick={toggleSelectionMode}
            >
              {isSelectionMode ? 'Done' : 'Select'}
            </button>
          )}
        </div>
      </header>

      <main className={styles.main}>
        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <span>Loading clips...</span>
          </div>
        ) : clips.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🎬</div>
            <h3 className={styles.emptyTitle}>No clips found</h3>
            <p className={styles.emptyDesc}>Paste a YouTube URL on the home page to start creating clips.</p>
            <Link href="/" className={styles.emptyBtn}>
              Create your first clip →
            </Link>
          </div>
        ) : (
          <div className={styles.gridContainer}>
            {isSelectionMode && (
              <div className={styles.selectAllRow}>
                <label className={styles.selectAllLabel}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={selectedIds.length === clips.length && clips.length > 0}
                    onChange={selectAll}
                  />
                  <span>Select all on page ({clips.length})</span>
                </label>
              </div>
            )}

            <div className={styles.grid}>
              {clips.map((clip, index) => {
                const isSelected = selectedIds.includes(clip.id);
                return (
                  <div
                    key={clip.id}
                    className={`${styles.card} ${isSelected ? styles.cardSelected : ''} ${
                      isSelectionMode ? styles.cardSelectable : ''
                    }`}
                    style={{ animationDelay: `${index * 0.03}s` }}
                    onClick={() => isSelectionMode && toggleSelectClip(clip.id)}
                  >
                    <div className={styles.videoWrapper}>
                      {(isSelectionMode || isSelected) && (
                        <div className={styles.checkboxWrapper}>
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            checked={isSelected}
                            onChange={() => toggleSelectClip(clip.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      )}

                      <video
                        className={styles.video}
                        src={clip.videoPath}
                        controls={!isSelectionMode}
                        preload="metadata"
                      />
                    </div>

                    <div className={styles.info}>
                      <h3 className={styles.clipTitle}>{clip.title || 'Untitled Clip'}</h3>
                      <div className={styles.metaRow}>
                        <span className={styles.metaDuration}>{formatDuration(clip.duration)}</span>
                        <span className={styles.metaDate}>{formatDate(clip.createdAt)}</span>
                      </div>

                      {!isSelectionMode && (
                        <div className={styles.actions} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <button
                            className={styles.socialBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveModalClip(clip);
                            }}
                            title="View & Copy Social Media Metadata"
                          >
                            <span>📋</span>
                            <span>Social Copy</span>
                          </button>

                          <button
                            className={styles.deleteBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(clip.id);
                            }}
                            aria-label="Delete clip"
                            title="Delete clip"
                          >
                            <svg
                              className={styles.deleteIcon}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.75"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  className={styles.pageBtn}
                  onClick={() => {
                    setCurrentPage((p) => Math.max(1, p - 1));
                    setSelectedIds([]);
                  }}
                  disabled={currentPage === 1 || isProcessingBulk}
                >
                  ← Prev
                </button>
                <span className={styles.pageInfo}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className={styles.pageBtn}
                  onClick={() => {
                    setCurrentPage((p) => Math.min(totalPages, p + 1));
                    setSelectedIds([]);
                  }}
                  disabled={currentPage === totalPages || isProcessingBulk}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating Action Dock */}
      {selectedIds.length > 0 && (
        <div className={styles.floatingActionBar}>
          <div className={styles.floatingContent}>
            <span className={styles.selectedCount}>
              {selectedIds.length} selected
            </span>
            <div className={styles.floatingActions}>
              <button
                className={styles.floatingBtnPrimary}
                onClick={handleBulkDownload}
                disabled={isProcessingBulk}
              >
                {isProcessingBulk ? 'Exporting...' : 'Download ZIP ↓'}
              </button>
              <button
                className={styles.floatingBtnDanger}
                onClick={handleBulkDelete}
                disabled={isProcessingBulk}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Social Copy Modal */}
      {activeModalClip && (
        <div className={styles.modalOverlay} onClick={() => setActiveModalClip(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <span>Social Media Copy</span>
                <span style={{ fontSize: '0.72rem', opacity: 0.7, fontWeight: 'normal' }}>
                  ({activeModalClip.title})
                </span>
              </h3>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setActiveModalClip(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {modalCopyStatus && (
              <div style={{ color: '#10b981', fontSize: '0.78rem', fontWeight: '600', textAlign: 'center' }}>
                ✓ {modalCopyStatus}
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {activeModalClip.channelName && (
                <span style={{ fontSize: '0.75rem', background: 'var(--bg-subtle)', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border-hairline)' }}>
                  👤 @{activeModalClip.channelName}
                </span>
              )}
              {activeModalClip.startTime && (
                <span style={{ fontSize: '0.75rem', background: 'var(--bg-subtle)', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border-hairline)' }}>
                  ⏱️ {activeModalClip.startTime} - {activeModalClip.endTime}
                </span>
              )}
              <span style={{ fontSize: '0.75rem', background: 'var(--bg-subtle)', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border-hairline)' }}>
                ⏳ {formatDuration(activeModalClip.duration)}
              </span>
            </div>

            {activeModalClip.hook && (
              <div style={{ background: 'var(--bg-subtle)', borderLeft: '3px solid var(--accent)', padding: '8px 10px', borderRadius: '4px' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: '600', color: 'var(--text-sub)', textTransform: 'uppercase' }}>Viral Hook</div>
                <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)', marginTop: '2px' }}>&ldquo;{activeModalClip.hook}&rdquo;</div>
              </div>
            )}

            {activeModalClip.caption && (
              <div style={{ background: 'var(--bg-subtle)', padding: '10px', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-sub)', lineHeight: '1.45', border: '1px solid var(--border-hairline)' }}>
                {activeModalClip.caption}
              </div>
            )}

            {Array.isArray(activeModalClip.hashtags) && activeModalClip.hashtags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {activeModalClip.hashtags.map((tag, i) => (
                  <span key={i} style={{ fontFamily: 'var(--font-geist-mono)', fontSize: '0.7rem', padding: '2px 6px', background: 'var(--bg-subtle)', borderRadius: '4px', border: '1px solid var(--border-hairline)' }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '6px' }}>
              <button
                type="button"
                className={styles.socialBtn}
                style={{ justifyContent: 'center', padding: '10px 8px', flexDirection: 'column' }}
                onClick={() => handleModalCopy('youtube')}
              >
                <span style={{ fontSize: '1.1rem' }}>🔴</span>
                <span style={{ fontWeight: '600' }}>YouTube</span>
              </button>
              <button
                type="button"
                className={styles.socialBtn}
                style={{ justifyContent: 'center', padding: '10px 8px', flexDirection: 'column' }}
                onClick={() => handleModalCopy('instagram')}
              >
                <span style={{ fontSize: '1.1rem' }}>📸</span>
                <span style={{ fontWeight: '600' }}>Instagram</span>
              </button>
              <button
                type="button"
                className={styles.socialBtn}
                style={{ justifyContent: 'center', padding: '10px 8px', flexDirection: 'column' }}
                onClick={() => handleModalCopy('tiktok')}
              >
                <span style={{ fontSize: '1.1rem' }}>🎵</span>
                <span style={{ fontWeight: '600' }}>TikTok</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
