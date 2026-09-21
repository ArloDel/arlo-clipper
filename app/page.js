'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ThemeToggle from '@/app/components/ThemeToggle';
import WebhookModal, { WebhookTriggerButton } from '@/app/components/WebhookModal';
import { resolveSource, SUPPORTED_VIDEO_EXTENSIONS } from '@/lib/sourceResolver';
import styles from './page.module.css';

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function HomePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('url'); // 'url' | 'upload'

  // URL state
  const [url, setUrl] = useState('');

  // Upload state
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  // Common Options
  const [ratio, setRatio] = useState('9:16');
  const [subtitles, setSubtitles] = useState(true);
  const [font, setFont] = useState('Inter');
  const [size, setSize] = useState('Medium');
  const [color, setColor] = useState('#ffffff');
  const [showOptions, setShowOptions] = useState(false);
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);

  // Detect platform in URL mode
  const detectedSource = useMemo(() => {
    if (!url.trim()) return null;
    return resolveSource(url.trim());
  }, [url]);

  // Clean up object URL on unmount or file change
  useEffect(() => {
    return () => {
      if (filePreview) {
        URL.revokeObjectURL(filePreview);
      }
    };
  }, [filePreview]);

  const handleFileSelect = (selectedFile) => {
    setUploadError('');
    if (!selectedFile) return;

    const ext = `.${selectedFile.name.split('.').pop().toLowerCase()}`;
    if (!SUPPORTED_VIDEO_EXTENSIONS.includes(ext) && !selectedFile.type.startsWith('video/')) {
      setUploadError(`Format file "${ext}" tidak didukung. Harap upload format: ${SUPPORTED_VIDEO_EXTENSIONS.join(', ')}`);
      return;
    }

    if (selectedFile.size > 1024 * 1024 * 1024) {
      setUploadError('Ukuran file melebihi 1 GB. Harap pilih video yang lebih kecil.');
      return;
    }

    if (filePreview) {
      URL.revokeObjectURL(filePreview);
    }

    setFile(selectedFile);
    try {
      const previewUrl = URL.createObjectURL(selectedFile);
      setFilePreview(previewUrl);
    } catch {
      setFilePreview(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleRemoveFile = () => {
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
    }
    setFile(null);
    setFilePreview(null);
    setUploadProgress(0);
    setUploadError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadFileToServer = (fileToUpload) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', fileToUpload);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.success && data.localFilePath) {
              resolve(data);
            } else {
              reject(new Error(data.error || 'Upload failed'));
            }
          } catch {
            reject(new Error('Invalid response from upload server'));
          }
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            reject(new Error(data.error || `Upload HTTP ${xhr.status}`));
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network error during file upload'));
      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUploadError('');

    if (activeTab === 'url') {
      if (!url.trim()) return;

      const params = new URLSearchParams({
        url: url.trim(),
        ratio,
        subtitles: subtitles.toString(),
        font,
        size,
        color,
      });

      router.push(`/editorial?${params.toString()}`);
    } else {
      if (!file) {
        setUploadError('Pilih atau tarik file video terlebih dahulu.');
        return;
      }

      setIsUploading(true);
      setUploadProgress(0);

      try {
        const uploadResult = await uploadFileToServer(file);

        const params = new URLSearchParams({
          localFilePath: uploadResult.localFilePath,
          fileName: file.name,
          ratio,
          subtitles: subtitles.toString(),
          font,
          size,
          color,
        });

        router.push(`/editorial?${params.toString()}`);
      } catch (err) {
        console.error('Upload error:', err);
        setUploadError(err.message || 'Gagal mengunggah file. Silakan coba lagi.');
        setIsUploading(false);
      }
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoMark}>▶</span>
          <span className={styles.logoText}>Arlo Clipper</span>
        </div>
        <div className={styles.headerActions}>
          <Link href="/bot" className={styles.libraryLink} title="Local Automation Bot">
            🤖 Auto Bot
          </Link>
          <WebhookTriggerButton onClick={() => setIsWebhookModalOpen(true)} />
          <ThemeToggle />
          <Link href="/library" className={styles.libraryLink}>
            Library <span className={styles.arrow}>→</span>
          </Link>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.hero}>
          <div className={styles.tagline}>MULTI-SOURCE VIDEO → SHORT CLIPS</div>
          <h1 className={styles.headline}>Clip the good parts.</h1>
          <p className={styles.subtitle}>
            Drop a video file or paste a link from YouTube, Google Drive, Dropbox, or TikTok. Get mobile-ready clips with styled subtitles in seconds.
          </p>
        </div>

        {/* ── Source Mode Tab Switcher ── */}
        <div className={styles.sourceTabs}>
          <button
            type="button"
            className={`${styles.sourceTabBtn} ${activeTab === 'url' ? styles.sourceTabBtnActive : ''}`}
            onClick={() => {
              setActiveTab('url');
              setUploadError('');
            }}
          >
            <span>🔗 URL Link</span>
          </button>
          <button
            type="button"
            className={`${styles.sourceTabBtn} ${activeTab === 'upload' ? styles.sourceTabBtnActive : ''}`}
            onClick={() => {
              setActiveTab('upload');
              setUploadError('');
            }}
          >
            <span>📁 Drag & Drop Video</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {activeTab === 'url' ? (
            <>
              <div className={styles.inputWrapper}>
                <input
                  type="url"
                  className={styles.urlInput}
                  placeholder="Paste YouTube, Google Drive, Dropbox, TikTok, or Direct video link"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
                {detectedSource && detectedSource.isValid && (
                  <span className={styles.detectedBadge}>
                    <span>✓</span> {detectedSource.platformName}
                  </span>
                )}
              </div>

              <div className={styles.platforms}>
                <span className={styles.platformBadge}>
                  <span className={styles.platformDot} /> YouTube
                </span>
                <span className={styles.platformBadge}>
                  <span className={styles.platformDot} /> TikTok
                </span>
                <span className={styles.platformBadge}>
                  <span className={styles.platformDot} /> Google Drive
                </span>
                <span className={styles.platformBadge}>
                  <span className={styles.platformDot} /> Dropbox
                </span>
                <span className={styles.platformBadge}>
                  <span className={styles.platformDot} /> Direct MP4/MOV
                </span>
              </div>
            </>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,.mp4,.mov,.webm,.mkv,.m4v,.avi"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />

              {!file ? (
                <div
                  className={`${styles.dropZone} ${isDragOver ? styles.dropZoneActive : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className={styles.dropZoneIcon}>📁</div>
                  <div className={styles.dropZoneTitle}>
                    Tarik file video ke sini atau <span className={styles.dropZoneHighlight}>Pilih File</span>
                  </div>
                  <div className={styles.dropZoneSub}>
                    Mendukung rekaman Zoom, Podcast, Vlog, dan video lokal (Maks 1 GB)
                  </div>
                  <div className={styles.supportedBadges}>
                    <span className={styles.formatTag}>MP4</span>
                    <span className={styles.formatTag}>MOV</span>
                    <span className={styles.formatTag}>WEBM</span>
                    <span className={styles.formatTag}>MKV</span>
                    <span className={styles.formatTag}>M4V</span>
                    <span className={styles.formatTag}>AVI</span>
                  </div>
                </div>
              ) : (
                <div className={styles.fileCard}>
                  <div className={styles.fileCardHeader}>
                    <div className={styles.fileCardLeft}>
                      <span className={styles.fileIcon}>🎬</span>
                      <div className={styles.fileDetails}>
                        <span className={styles.fileNameText} title={file.name}>{file.name}</span>
                        <div className={styles.fileMetaRow}>
                          <span className={styles.fileSize}>{formatFileSize(file.size)}</span>
                          <span className={styles.fileTag}>{file.name.split('.').pop()}</span>
                        </div>
                      </div>
                    </div>
                    <div className={styles.fileCardActions}>
                      <button
                        type="button"
                        className={styles.changeFileBtn}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        Ganti
                      </button>
                      <button
                        type="button"
                        className={styles.removeFileBtn}
                        onClick={handleRemoveFile}
                        disabled={isUploading}
                      >
                        Hapus
                      </button>
                    </div>
                  </div>

                  {filePreview && (
                    <div className={styles.previewVideoWrapper}>
                      <video
                        src={filePreview}
                        className={styles.previewVideo}
                        controls
                        muted
                      />
                    </div>
                  )}

                  {isUploading && (
                    <div className={styles.progressContainer}>
                      <div className={styles.progressLabelRow}>
                        <span>Mengunggah video ke server...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className={styles.progressBarTrack}>
                        <div
                          className={styles.progressBarFill}
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {uploadError && (
                <div className={styles.errorMessage}>
                  ⚠️ {uploadError}
                </div>
              )}
            </>
          )}

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

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={isUploading}
          >
            {isUploading
              ? `Mengunggah (${uploadProgress}%) ...`
              : activeTab === 'upload'
              ? (
                <>
                  Upload & Start clipping <span className={styles.arrow}>→</span>
                </>
              )
              : (
                <>
                  Start clipping <span className={styles.arrow}>→</span>
                </>
              )}
          </button>
        </form>
      </main>

      {/* Webhook Automation Settings & Test Modal */}
      <WebhookModal
        isOpen={isWebhookModalOpen}
        onClose={() => setIsWebhookModalOpen(false)}
      />
    </div>
  );
}
