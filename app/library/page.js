'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './library.module.css';

export default function LibraryPage() {
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Selection state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);

  useEffect(() => {
    fetchClips(currentPage);
  }, [currentPage]);

  const fetchClips = async (page = 1) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/clips?page=${page}&limit=9`);
      if (response.ok) {
        const data = await response.json();
        setClips(data.clips);
        setTotalPages(data.totalPages);
        if (page > data.totalPages && data.totalPages > 0) {
          setCurrentPage(data.totalPages);
        } else {
          setCurrentPage(data.currentPage);
        }
      }
    } catch (error) {
      console.error('Failed to fetch clips:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this clip?')) {
      return;
    }

    try {
      const response = await fetch(`/api/clips/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchClips(currentPage);
      } else {
        console.error('Failed to delete clip');
      }
    } catch (error) {
      console.error('Error deleting clip:', error);
    }
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedIds([]); // Clear selection when toggling
  };

  const toggleSelectClip = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(selectedId => selectedId !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedIds.length === clips.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(clips.map(c => c.id));
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} clips?`)) {
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
        fetchClips(currentPage);
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
    return date.toLocaleDateString();
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Back
          </Link>
          <h1 className={styles.title}>My Library</h1>
        </div>
        
        {clips.length > 0 && (
          <button 
            className={`${styles.selectModeBtn} ${isSelectionMode ? styles.selectModeActive : ''}`}
            onClick={toggleSelectionMode}
          >
            {isSelectionMode ? 'Cancel' : 'Select'}
          </button>
        )}
      </header>

      <main className={styles.main}>
        {loading ? (
          <div className={styles.loading}>
            <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <style>{`
                .spinner_V8m1 { transform-origin: center; animation: spinner_zKoa 2s linear infinite; }
                .spinner_V8m1 circle { stroke-linecap: round; animation: spinner_Ypzi 1.5s ease-in-out infinite; }
                @keyframes spinner_zKoa { 100% { transform: rotate(360deg); } }
                @keyframes spinner_Ypzi { 0% { stroke-dasharray: 0 150; stroke-dashoffset: 0; } 47.5% { stroke-dasharray: 42 150; stroke-dashoffset: -16; } 95%, 100% { stroke-dasharray: 42 150; stroke-dashoffset: -59; } }
              `}</style>
              <g className="spinner_V8m1">
                <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="3"></circle>
              </g>
            </svg>
            <span style={{ marginLeft: '12px' }}>Loading clips...</span>
          </div>
        ) : clips.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🎬</div>
            <p>Your library is empty.</p>
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
                  <span>Select All on this page</span>
                </label>
              </div>
            )}
            
            <div className={styles.grid}>
              {clips.map((clip, index) => {
                const isSelected = selectedIds.includes(clip.id);
                return (
                  <div 
                    key={clip.id} 
                    className={`${styles.card} ${isSelected ? styles.cardSelected : ''} ${isSelectionMode ? styles.cardSelectable : ''}`}
                    style={{ animationDelay: `${index * 0.05}s` }}
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
                            onClick={(e) => e.stopPropagation()} // Prevent double trigger
                          />
                        </div>
                      )}
                      
                      {/* Backdrop video for the blur effect */}
                      <video 
                        className={styles.videoBackdrop} 
                        src={clip.videoPath} 
                        muted
                        loop
                        playsInline
                        autoPlay={false}
                      />
                      <video 
                        className={styles.video} 
                        src={clip.videoPath} 
                        controls={!isSelectionMode} // Disable controls in selection mode so clicking selects it
                        preload="metadata"
                        onPlay={(e) => {
                          if (isSelectionMode) return e.preventDefault();
                          const backdrop = e.target.previousElementSibling;
                          if (backdrop) {
                            backdrop.currentTime = e.target.currentTime;
                            backdrop.play().catch(() => {});
                          }
                        }}
                        onPause={(e) => {
                          const backdrop = e.target.previousElementSibling;
                          if (backdrop) backdrop.pause();
                        }}
                        onSeeked={(e) => {
                          const backdrop = e.target.previousElementSibling;
                          if (backdrop) backdrop.currentTime = e.target.currentTime;
                        }}
                      />
                    </div>
                    <div className={styles.info}>
                      <h3 className={styles.clipTitle}>{clip.title || 'Untitled Clip'}</h3>
                      <div className={styles.meta}>
                        <span>{formatDate(clip.createdAt)}</span>
                        <span>{formatDuration(clip.duration)}</span>
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
                            <svg className={styles.deleteIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
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
                    setCurrentPage(p => Math.max(1, p - 1));
                    setSelectedIds([]); // Clear selection on page change
                  }}
                  disabled={currentPage === 1 || isProcessingBulk}
                >
                  ← Previous
                </button>
                <span className={styles.pageInfo}>
                  Page {currentPage} of {totalPages}
                </span>
                <button 
                  className={styles.pageBtn} 
                  onClick={() => {
                    setCurrentPage(p => Math.min(totalPages, p + 1));
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

      {/* Floating Action Bar */}
      {selectedIds.length > 0 && (
        <div className={styles.floatingActionBar}>
          <div className={styles.floatingContent}>
            <span className={styles.selectedCount}>
              {selectedIds.length} clip{selectedIds.length > 1 ? 's' : ''} selected
            </span>
            <div className={styles.floatingActions}>
              <button 
                className={styles.floatingBtnPrimary} 
                onClick={handleBulkDownload}
                disabled={isProcessingBulk}
              >
                {isProcessingBulk ? 'Processing...' : 'Download ZIP ⬇️'}
              </button>
              <button 
                className={styles.floatingBtnDanger} 
                onClick={handleBulkDelete}
                disabled={isProcessingBulk}
              >
                Delete 🗑️
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
