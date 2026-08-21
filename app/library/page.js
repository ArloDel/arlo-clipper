'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import ThemeToggle from '../components/ThemeToggle';
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
                        <div className={styles.actions}>
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
    </div>
  );
}
