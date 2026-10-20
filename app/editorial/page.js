'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import WebhookModal, { WebhookTriggerButton } from '@/app/components/WebhookModal';
import DirectPublishModal, { DirectPublishTriggerButton } from '@/app/components/DirectPublishModal';
import { getYouTubeCopy, getInstagramCopy, getTikTokCopy } from '@/lib/socialCopy';
import { BGM_TRACKS } from '@/lib/audioCatalog';
import { BROLL_THEMES, detectAutoBroll } from '@/lib/brollCatalog';
import { CAPTION_PRESETS, DEFAULT_CAPTION_STYLE } from '@/lib/captionPresets';
import { TITLE_PRESETS } from '@/lib/titlePresets';
import { calculateViralityScore } from '@/lib/viralityScore';
import styles from './page.module.css';
import editorStyles from './editor.module.css';

function getYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
  return match ? match[1] : null;
}

function getSegmentWords(seg) {
  if (!seg) return [];
  if (Array.isArray(seg.words) && seg.words.length > 0) return seg.words;
  const tokens = (seg.text || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const segDur = Math.max(0.1, (seg.end || 0) - (seg.start || 0));
  const wordDur = segDur / tokens.length;
  return tokens.map((token, idx) => ({
    word: token,
    start: (seg.start || 0) + idx * wordDur,
    end: (seg.start || 0) + (idx + 1) * wordDur,
  }));
}

function BrollOverlay({ videoRef, brollSettings }) {
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;

    let animId = null;
    const updateTime = () => {
      if (video) {
        setCurrentTime(video.currentTime);
        if (!video.paused && !video.ended) animId = requestAnimationFrame(updateTime);
      }
    };
    const onPlay = () => {
      if (animId) cancelAnimationFrame(animId);
      animId = requestAnimationFrame(updateTime);
    };
    const onPause = () => {
      if (animId) cancelAnimationFrame(animId);
      if (video) setCurrentTime(video.currentTime);
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onPause);
    video.addEventListener('timeupdate', onPause);

    return () => {
      if (animId) cancelAnimationFrame(animId);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onPause);
      video.removeEventListener('timeupdate', onPause);
    };
  }, [videoRef]);

  if (!brollSettings?.enabled) return null;
  const overlays = Array.isArray(brollSettings.overlays) ? brollSettings.overlays : [];
  const activeOverlay = overlays.find((o) => currentTime >= o.start && currentTime <= o.end);

  if (!activeOverlay) return null;

  return (
    <div key={activeOverlay.id || activeOverlay.start} className={editorStyles.brollOverlay}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={activeOverlay.assetPath}
        alt={activeOverlay.themeName || 'B-Roll'}
        className={editorStyles.brollImage}
      />
      <div className={editorStyles.brollBadge}>
        <span>{activeOverlay.icon || '🎬'}</span>
        <span>{activeOverlay.themeName || 'B-Roll'}</span>
      </div>
    </div>
  );
}

function TitleBarOverlay({ videoRef, titleBar }) {
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;
    const onTime = () => setCurrentTime(video.currentTime);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('seeked', onTime);
    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('seeked', onTime);
    };
  }, [videoRef]);

  if (!titleBar?.enabled || !titleBar.text) return null;
  if (currentTime >= (titleBar.seconds || 2.5)) return null;

  const preset = TITLE_PRESETS.find((p) => p.id === titleBar.preset) || TITLE_PRESETS[0];
  const posStyle = preset.style.position === 'center' ? { top: '50%', transform: 'translateY(-50%)' } : { top: '9%' };
  const remain = (titleBar.seconds || 2.5) - currentTime;
  const opacity = remain < 0.25 ? Math.max(0, remain / 0.25) : currentTime < 0.15 ? currentTime / 0.15 : 1;

  return (
    <div
      className={editorStyles.titlePreview}
      style={{
        ...posStyle,
        fontFamily: `${preset.style.font}, sans-serif`,
        color: preset.style.color,
        fontSize: `${preset.style.sizePct}cqh`,
        opacity,
      }}
    >
      {titleBar.text}
    </div>
  );
}

function SubtitleOverlay({ videoRef, segments, style }) {
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;
    let animId = null;
    const updateTime = () => {
      if (video) {
        setCurrentTime(video.currentTime);
        if (!video.paused && !video.ended) animId = requestAnimationFrame(updateTime);
      }
    };
    const onPlay = () => {
      if (animId) cancelAnimationFrame(animId);
      animId = requestAnimationFrame(updateTime);
    };
    const onPause = () => {
      if (animId) cancelAnimationFrame(animId);
      if (video) setCurrentTime(video.currentTime);
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onPause);
    video.addEventListener('timeupdate', onPause);

    return () => {
      if (animId) cancelAnimationFrame(animId);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onPause);
      video.removeEventListener('timeupdate', onPause);
    };
  }, [videoRef]);

  const activeSeg = (segments || []).find((s) => currentTime >= s.start && currentTime <= s.end);
  if (!activeSeg) return null;

  const sizeMap = { small: '1.15rem', medium: '1.5rem', large: '2.0rem' };
  const fontSize = sizeMap[style.size?.toLowerCase()] || '1.5rem';

  const textShadow = [
    style.shadow ? '0px 2px 5px rgba(0,0,0,0.7)' : '',
    style.outline ? '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000' : '',
  ].filter(Boolean).join(', ');

  const isKaraoke = style.animation === 'Karaoke';

  if (isKaraoke) {
    const words = getSegmentWords(activeSeg);
    let highlightColor = style.color || '#FFFF00';
    if (highlightColor.toLowerCase() === '#ffffff') highlightColor = '#FFFF00';

    return (
      <div className={editorStyles.subtitleOverlay} style={{ fontFamily: style.font || 'Impact', fontSize }}>
        <div className={editorStyles.karaokeContainer}>
          {words.map((w, idx) => {
            const isCurrent =
              currentTime >= w.start &&
              (words[idx + 1] && words[idx + 1].start > w.start
                ? currentTime < Math.min(w.end + 0.15, words[idx + 1].start)
                : currentTime <= w.end + 0.15);
            const isPast = currentTime > (words[idx + 1] ? words[idx + 1].start : w.end + 0.15);

            return (
              <span
                key={idx}
                className={`${editorStyles.karaokeWord} ${isCurrent ? editorStyles.karaokeWordActive : ''} ${isPast ? editorStyles.karaokeWordPast : ''}`}
                style={{
                  color: isCurrent ? highlightColor : '#FFFFFF',
                  textShadow: isCurrent ? `0 0 16px ${highlightColor}, 0 0 6px ${highlightColor}, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000` : (textShadow || 'none'),
                }}
              >
                {w.word}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  const getAnimationClass = (anim) => {
    switch (anim) {
      case 'Pop': return editorStyles.animatePop;
      case 'Slide Up': return editorStyles.animateSlideUp;
      case 'Blur': return editorStyles.animateBlur;
      case 'Bounce': return editorStyles.animateBounce;
      default: return '';
    }
  };

  return (
    <div
      key={`${activeSeg.text}-${style.animation}`}
      className={`${editorStyles.subtitleOverlay} ${getAnimationClass(style.animation)}`}
      style={{
        fontFamily: style.font || 'Impact',
        fontSize,
        color: style.color || '#FFFF00',
        textShadow: textShadow || 'none',
      }}
    >
      {activeSeg.text}
    </div>
  );
}

function EditorStudio({ clips: initialClips, onSave, onOpenPublish, ratio, initialStyle, initialWatermark, projectTitle }) {
  const [activeClipIdx, setActiveClipIdx] = useState(0);
  const [clips, setClips] = useState(initialClips);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [lipTrackingLoading, setLipTrackingLoading] = useState(false);
  const [splitScreenLoading, setSplitScreenLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [styleApplied, setStyleApplied] = useState(false);
  
  // Style settings per clip
  const [clipStyles, setClipStyles] = useState(
    initialClips.map(() => ({
      ...DEFAULT_CAPTION_STYLE,
      font: initialStyle?.font || DEFAULT_CAPTION_STYLE.font,
      size: initialStyle?.size || DEFAULT_CAPTION_STYLE.size,
      color: initialStyle?.color || DEFAULT_CAPTION_STYLE.color,
    }))
  );

  // Audio settings per clip
  const [clipAudioSettings, setClipAudioSettings] = useState(
    initialClips.map((c) => ({
      bgmTrack: c.audioSettings?.bgmTrack || 'upbeat-energetic',
      bgmVolume: typeof c.audioSettings?.bgmVolume === 'number' ? c.audioSettings.bgmVolume : 0.3,
      duckingEnabled: c.audioSettings?.duckingEnabled !== false,
      duckingStrength: c.audioSettings?.duckingStrength || 'medium',
      sfxEnabled: c.audioSettings?.sfxEnabled !== false,
      sfxVolume: typeof c.audioSettings?.sfxVolume === 'number' ? c.audioSettings.sfxVolume : 0.7,
    }))
  );

  // B-Roll settings per clip
  const [clipBrollSettings, setClipBrollSettings] = useState(
    initialClips.map((c) => ({
      enabled: c.brollSettings?.enabled !== false,
      theme: c.brollSettings?.theme || 'auto',
      overlays: Array.isArray(c.brollSettings?.overlays) && c.brollSettings.overlays.length > 0
        ? c.brollSettings.overlays
        : detectAutoBroll(c.segments, c.hook || c.title),
    }))
  );

  // Watermark (branding) per clip
  const [clipWatermarks, setClipWatermarks] = useState(
    initialClips.map(() =>
      initialWatermark
        ? { ...initialWatermark }
        : { enabled: false, type: 'text', text: '', imagePath: '', position: 'top-right', sizePct: 6, opacity: 0.7 }
    )
  );
  const [wmUploading, setWmUploading] = useState(false);

  const handleClipWatermark = (patch) => {
    const next = [...clipWatermarks];
    next[activeClipIdx] = { ...next[activeClipIdx], ...patch };
    setClipWatermarks(next);
  };

  // Opening title bar per clip
  const [clipTitleBars, setClipTitleBars] = useState(
    initialClips.map((c) => ({
      enabled: false,
      text: c.hook || c.title || '',
      preset: 'punch',
      seconds: 2.5,
      position: 'top',
    }))
  );

  const handleClipTitleBar = (patch) => {
    const next = [...clipTitleBars];
    next[activeClipIdx] = { ...next[activeClipIdx], ...patch };
    setClipTitleBars(next);
  };

  const handleTitlePreset = (presetId) => {
    const preset = TITLE_PRESETS.find((p) => p.id === presetId) || TITLE_PRESETS[0];
    handleClipTitleBar({ preset: preset.id, position: preset.style.position });
  };

  const handleTitleEnable = (enabled) => {
    const current = clipTitleBars[activeClipIdx];
    const patch = { enabled };
    if (enabled && !current.text) patch.text = clips[activeClipIdx]?.hook || clips[activeClipIdx]?.title || 'Judul Viral';
    handleClipTitleBar(patch);
  };

  const handleClipLogoUpload = async (e) => {
    const logoFile = e.target.files?.[0];
    if (!logoFile) return;
    setWmUploading(true);
    try {
      const fd = new FormData();
      fd.append('logo', logoFile);
      const res = await fetch('/api/watermark/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.imagePath) {
        handleClipWatermark({ type: 'image', imagePath: data.imagePath, enabled: true });
      } else {
        alert(`Gagal upload logo: ${data.error || 'Terjadi kesalahan'}`);
      }
    } catch (err) {
      alert(`Error upload logo: ${err.message}`);
    } finally {
      setWmUploading(false);
      e.target.value = '';
    }
  };

  const videoRef = useRef(null);
  const bgmAudioRef = useRef(null);
  const previewAudioRef = useRef(null);
  const sfxAudioRef = useRef(null);
  const rulerRef = useRef(null);
  const scrubbingRef = useRef(false);
  const [previewingTrackId, setPreviewingTrackId] = useState(null);

  // Playback state & Scrubbing
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoTime, setVideoTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  const activeClip = clips[activeClipIdx] || {};
  const activeStyle = clipStyles[activeClipIdx] || {};
  const activeAudio = clipAudioSettings[activeClipIdx] || {};
  const activeBroll = clipBrollSettings[activeClipIdx] || {};
  const activeWatermark = clipWatermarks[activeClipIdx] || null;
  const activeTitleBar = clipTitleBars[activeClipIdx] || null;

  const wmPreviewPos = (position) => {
    const [vertical, horizontal] = String(position || 'top-right').split('-');
    return {
      [vertical === 'bottom' ? 'bottom' : 'top']: '2.8%',
      [horizontal === 'left' ? 'left' : 'right']: '3.5%',
    };
  };

  const normalizeFormat = (r) => (r === '1:1' ? '1:1' : r === '9:16-blur' ? '9:16-blur' : '9:16');
  const [clipFormats, setClipFormats] = useState(initialClips.map(() => normalizeFormat(ratio)));
  const [reformatting, setReformatting] = useState(false);

  const activeFormat = clipFormats[activeClipIdx] || '9:16';
  const previewAspect = activeFormat === '1:1' ? '1 / 1' : '9 / 16';
  const trackerRatio = activeFormat === '9:16-blur' ? '9:16' : activeFormat;

  // ── Manual Framing (pan + zoom) ──
  const [framingMode, setFramingMode] = useState(false);
  const [frameRect, setFrameRect] = useState(null);
  const [frameZoom, setFrameZoom] = useState(1);
  const [sourceAR, setSourceAR] = useState(null);
  const [clipKeyframes, setClipKeyframes] = useState(initialClips.map(() => null));
  const [keyframes, setKeyframes] = useState(null);
  const [activeKfId, setActiveKfId] = useState(null);
  const framingLayerRef = useRef(null);
  const framingDragRef = useRef(null);
  const kfTimelineRef = useRef(null);
  const kfRafRef = useRef(null);
  const kfIdRef = useRef(1);
  const ZOOM_MIN = 0.35;

  const targetAspect = activeFormat === '1:1' ? 1 : 9 / 16;
  const clipDur = Math.max(1, activeClip.durationSec || (Number(activeClip.endSec) - Number(activeClip.startSec)) || 15);

  const sizeFrameBox = (zoom) => {
    const ar = sourceAR || 16 / 9;
    const h = zoom;
    const w = h * (targetAspect / ar);
    return { w: Math.min(1, w), h: Math.min(1, h) };
  };

  const clampFrameRect = (rect) => ({
    ...rect,
    x: Math.min(1 - rect.w, Math.max(0, rect.x)),
    y: Math.min(1 - rect.h, Math.max(0, rect.y)),
    w: rect.w,
    h: rect.h,
  });

  const centerFrameRect = () => {
    const { w, h } = sizeFrameBox(1);
    return clampFrameRect({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
  };

  const placeBoxCenterAt = (pxN, pyN) => {
    setFrameRect((prev) => clampFrameRect({ ...prev, x: pxN - prev.w / 2, y: pyN - prev.h / 2 }));
    setKeyframes((prev) => {
      if (!prev) return prev;
      return prev.map((kf) =>
        kf._id === activeKfId ? clampFrameRect({ ...kf, x: pxN - kf.w / 2, y: pyN - kf.h / 2 }) : kf
      );
    });
  };

  const enterFraming = () => {
    const existing = clipKeyframes[activeClipIdx];
    const kfs = existing && Array.isArray(existing) ? existing.map((kf) => ({ ...kf })) : [{ _id: nextKfId(), t: 0, ...centerFrameRect() }];
    setKeyframes(kfs);
    setActiveKfId(kfs[0]._id);
    setFrameRect(clampFrameRect(kfs[0]));
    setFrameZoom(kfs[0]?.h ?? 1);
    setSourceAR(null);
    setFramingMode(true);
    setActiveDrawer('cut');
  };

  const framingReset = () => {
    const base = { _id: nextKfId(), t: 0, ...centerFrameRect() };
    setKeyframes([base]);
    setActiveKfId(base._id);
    setFrameRect(clampFrameRect(base));
    setFrameZoom(1);
  };

  const exitFraming = () => {
    setFramingMode(false);
    setFrameRect(null);
    setKeyframes(null);
    setActiveKfId(null);
  };

  const handleFramingPointerDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const layer = framingLayerRef.current;
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    framingDragRef.current = rect;
    placeBoxCenterAt((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
  };

  const handleFramingPointerMove = (e) => {
    if (!framingDragRef.current || !framingDragRef.current.width) return;
    const rect = framingLayerRef.current?.getBoundingClientRect();
    if (!rect) return;
    placeBoxCenterAt((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
  };

  const handleFramingPointerUp = () => {
    framingDragRef.current = null;
  };

  const handleFrameZoom = (zoom) => {
    const z = Math.max(ZOOM_MIN, Math.min(1, zoom));
    setFrameZoom(z);
    const resize = (rect, w, h) =>
      clampFrameRect({ ...rect, x: rect.x + rect.w / 2 - w / 2, y: rect.y + rect.h / 2 - h / 2, w, h });
    setFrameRect((prev) => {
      const { w, h } = sizeFrameBox(z);
      return resize(prev, w, h);
    });
    setKeyframes((prevKfs) => {
      if (!prevKfs) return prevKfs;
      const { w, h } = sizeFrameBox(z);
      return prevKfs.map((kf) => resize(kf, w, h));
    });
  };

  const nextKfId = () => `_kf${kfIdRef.current++}`;

  const kfInterpolateRect = useCallback((kfs, t) => {
    if (!kfs || kfs.length === 0) return frameRect;
    if (kfs.length === 1) return kfs[0];
    const time = Math.max(kfs[0].t, Math.min(kfs[kfs.length - 1].t, t));
    let i = 0;
    while (i < kfs.length - 2 && kfs[i + 1].t <= time) i++;
    const k0 = kfs[i];
    const k1 = kfs[i + 1];
    const span = Math.max(0.01, k1.t - k0.t);
    const f = Math.min(1, Math.max(0, (time - k0.t) / span));
    return {
      x: k0.x + (k1.x - k0.x) * f,
      y: k0.y + (k1.y - k0.y) * f,
      w: k0.w + (k1.w - k0.w) * f,
      h: k0.h + (k1.h - k0.h) * f,
    };
  }, [frameRect]);

  useEffect(() => {
    if (!framingMode || !keyframes || keyframes.length <= 1) return;
    const video = videoRef.current;
    if (!video) return;
    const tick = () => setFrameRect(kfInterpolateRect(keyframes, video.currentTime));
    const start = () => {
      if (!kfRafRef.current) kfRafRef.current = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (kfRafRef.current) {
        cancelAnimationFrame(kfRafRef.current);
        kfRafRef.current = null;
      }
    };
    const onSeek = () => setFrameRect(kfInterpolateRect(keyframes, video.currentTime));
    const onPlay = () => {
      stop();
      kfRafRef.current = requestAnimationFrame(function loop() {
        tick();
        kfRafRef.current = requestAnimationFrame(loop);
      });
    };
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', stop);
    video.addEventListener('seeked', onSeek);
    if (!video.paused) onPlay();
    return () => {
      stop();
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', stop);
      video.removeEventListener('seeked', onSeek);
    };
  }, [framingMode, keyframes, kfInterpolateRect]);

  const kfSelectById = (id) => {
    setActiveKfId(id);
    const kf = keyframes?.find((k) => k._id === id);
    if (kf) setFrameRect(clampFrameRect(kf));
  };

  const kfAddAt = (t) => {
    const rectNow = frameRect;
    const id = nextKfId();
    setKeyframes((prev) => {
      const base = prev || [];
      return [...base, { _id: id, t, x: rectNow.x, y: rectNow.y, w: rectNow.w, h: rectNow.h }].sort((a, b) => a.t - b.t);
    });
    setActiveKfId(id);
  };

  const kfMoveTimeById = (id, t) => {
    setKeyframes((prev) =>
      prev ? prev.map((kf) => (kf._id === id ? { ...kf, t: Math.max(0, Math.min(clipDur, t)) } : kf)) : prev
    );
  };

  const kfSortById = () => {
    setKeyframes((prev) => (prev ? [...prev].sort((a, b) => a.t - b.t) : prev));
  };

  const kfRemoveById = (id) => {
    if (!keyframes || keyframes.length <= 1) return;
    const next = keyframes.filter((kf) => kf._id !== id);
    setKeyframes(next);
    if (activeKfId === id) {
      const kf = next[0];
      setActiveKfId(kf._id);
      setFrameRect(clampFrameRect(kf));
    }
  };

  const kfTimelineDown = (e) => {
    const track = kfTimelineRef.current;
    if (!track) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = track.getBoundingClientRect();
    const t = Math.max(0, Math.min(clipDur, ((e.clientX - rect.left) / rect.width) * clipDur));
    kfAddAt(t);
  };

  const handleFramingApply = async () => {
    const current = clips[activeClipIdx];
    if (!current?.id || !current?.startSec || !current?.endSec) return;
    setReformatting(true);
    try {
      const res = await fetch('/api/reformat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId: current.id,
          format: activeFormat,
          startSec: current.startSec,
          endSec: current.endSec,
          cropKeyframes: (keyframes || [{ _id: 'a', t: 0, ...frameRect }]).map(({ t, x, y, w, h }) => ({ t: Math.max(0, Math.min(clipDur, t)), x, y, w, h })),
        }),
      });
      const data = await res.json();
      if (res.ok && data.videoPath) {
        setClipKeyframes((prev) =>
          prev.map((kf, i) => (i === activeClipIdx ? (keyframes || [{ t: 0, ...frameRect }]).map((k) => ({ ...k })) : kf))
        );
        setClips((prev) =>
          prev.map((c, i) =>
            i === activeClipIdx
              ? { ...c, videoPath: data.videoPath + `?v=${Date.now()}`, faceTracking: false, lipTracking: false, splitScreen: false }
              : c
          )
        );
        exitFraming();
      } else {
        alert(`Gagal menerapkan framing: ${data.error || 'Terjadi kesalahan'}`);
      }
    } catch (err) {
      alert(`Error menerapkan framing: ${err.message}`);
    } finally {
      setReformatting(false);
    }
  };

  const handleFormatChange = async (newFormat) => {
    if (reformatting || newFormat === activeFormat) return;
    const current = clips[activeClipIdx];
    if (!current?.id || !current?.startSec || !current?.endSec) {
      alert('Clip ini tidak menyimpan data slicing; tidak bisa mengubah format.');
      return;
    }

    setReformatting(true);
    try {
      const res = await fetch('/api/reformat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId: current.id,
          format: newFormat,
          startSec: current.startSec,
          endSec: current.endSec,
        }),
      });
      const data = await res.json();
      if (res.ok && data.videoPath) {
        setClips((prev) =>
          prev.map((c, i) =>
            i === activeClipIdx ? { ...c, videoPath: data.videoPath, faceTracking: false, lipTracking: false, splitScreen: false } : c
          )
        );
        setClipFormats((prev) => prev.map((f, i) => (i === activeClipIdx ? newFormat : f)));
      } else {
        alert(`Gagal mengubah format: ${data.error || 'Terjadi kesalahan'}`);
      }
    } catch (err) {
      alert(`Error mengubah format: ${err.message}`);
    } finally {
      setReformatting(false);
    }
  };

  const viralityScore = activeClip.viralityScore || calculateViralityScore({
    hook: activeClip.hook,
    title: activeClip.title,
    caption: activeClip.caption,
    duration: activeClip.duration,
    segments: activeClip.segments,
    words: activeClip.words,
  });

  const handleUpdateHook = (newHook) => {
    const updatedClips = [...clips];
    const curr = updatedClips[activeClipIdx] || {};
    const newScore = calculateViralityScore({ ...curr, hook: newHook });
    updatedClips[activeClipIdx] = { ...curr, hook: newHook, viralityScore: newScore };
    setClips(updatedClips);
  };

  const updateStyle = (key, val) => {
    const newStyles = [...clipStyles];
    newStyles[activeClipIdx] = { ...newStyles[activeClipIdx], [key]: val };
    setClipStyles(newStyles);
  };

  const applyCaptionStyle = (style) => {
    const newStyles = [...clipStyles];
    newStyles[activeClipIdx] = { ...newStyles[activeClipIdx], ...style };
    setClipStyles(newStyles);
  };

  const applyActiveStyleToAll = () => {
    const source = clipStyles[activeClipIdx];
    if (!source) return;
    setClipStyles(clipStyles.map(() => ({ ...source })));
    setStyleApplied(true);
    setTimeout(() => setStyleApplied(false), 2000);
  };

  const updateAudioSetting = (key, val) => {
    const newAudio = [...clipAudioSettings];
    newAudio[activeClipIdx] = { ...newAudio[activeClipIdx], [key]: val };
    setClipAudioSettings(newAudio);
  };

  const updateBrollSetting = (key, val) => {
    const newBroll = [...clipBrollSettings];
    newBroll[activeClipIdx] = { ...newBroll[activeClipIdx], [key]: val };
    setClipBrollSettings(newBroll);
  };

  const handleBrollThemeChange = (newTheme) => {
    const currentClip = clips[activeClipIdx];
    const newOverlays = detectAutoBroll(currentClip.segments, currentClip.hook || currentClip.title, newTheme);
    const newBroll = [...clipBrollSettings];
    newBroll[activeClipIdx] = { ...newBroll[activeClipIdx], theme: newTheme, overlays: newOverlays };
    setClipBrollSettings(newBroll);
  };

  const handleRemoveBrollOverlay = (overlayId) => {
    const newBroll = [...clipBrollSettings];
    const currentOverlays = newBroll[activeClipIdx]?.overlays || [];
    newBroll[activeClipIdx] = { ...newBroll[activeClipIdx], overlays: currentOverlays.filter((o) => o.id !== overlayId) };
    setClipBrollSettings(newBroll);
  };

  const handleAddBrollAtCurrentTime = () => {
    const video = videoRef.current;
    const currTime = video ? Number(video.currentTime.toFixed(2)) : 0;
    const currentThemeId = activeBroll.theme !== 'auto' ? activeBroll.theme : 'finance';
    const themeObj = BROLL_THEMES.find((t) => t.id === currentThemeId) || BROLL_THEMES[0];
    
    const newOverlay = {
      id: `custom-broll-${Date.now()}`,
      theme: themeObj.id,
      themeName: themeObj.name,
      icon: themeObj.icon,
      color: themeObj.color,
      start: currTime,
      end: Number((currTime + 2.5).toFixed(2)),
      duration: 2.5,
      assetPath: themeObj.assetPath,
      keyword: 'Highlight Visual',
      label: `${themeObj.icon} ${themeObj.name}`,
    };

    const newBroll = [...clipBrollSettings];
    const currentOverlays = [...(newBroll[activeClipIdx]?.overlays || []), newOverlay].sort((a, b) => a.start - b.start);
    newBroll[activeClipIdx] = { ...newBroll[activeClipIdx], overlays: currentOverlays };
    setClipBrollSettings(newBroll);
  };

  // Video playback & Audio Ducking sync
  useEffect(() => {
    const video = videoRef.current;
    const bgm = bgmAudioRef.current;
    const sfx = sfxAudioRef.current;
    if (!video) return;

    const onPlayState = () => setIsPlaying(true);
    const onPauseState = () => setIsPlaying(false);
    const onLoadedMeta = () => {
      setVideoDuration(video.duration || clipDur);
      setVideoTime(video.currentTime || 0);
    };
    const onTimeUpdate = () => setVideoTime(video.currentTime || 0);

    video.addEventListener('play', onPlayState);
    video.addEventListener('pause', onPauseState);
    video.addEventListener('loadedmetadata', onLoadedMeta);
    video.addEventListener('timeupdate', onTimeUpdate);

    const selectedTrack = BGM_TRACKS.find((t) => t.id === activeAudio.bgmTrack && t.id !== 'none');
    if (bgm) {
      if (!selectedTrack || !selectedTrack.path) {
        bgm.pause();
      } else {
        if (bgm.src !== window.location.origin + selectedTrack.path && !bgm.src.endsWith(selectedTrack.path)) {
          bgm.src = selectedTrack.path;
        }
        bgm.loop = true;
      }
    }

    const duckFactors = { light: 0.65, medium: 0.35, heavy: 0.15 };
    const duckMultiplier = activeAudio.duckingEnabled ? (duckFactors[activeAudio.duckingStrength] ?? 0.35) : 1.0;

    let targetVolume = activeAudio.bgmVolume;
    let animFrame = null;
    let triggeredSfxTimes = new Set();

    const smoothVolumeStep = () => {
      if (!bgm || bgm.paused) return;
      const current = bgm.volume;
      const diff = targetVolume - current;
      if (Math.abs(diff) > 0.01) {
        bgm.volume = Math.max(0, Math.min(1, current + diff * 0.25));
        animFrame = requestAnimationFrame(smoothVolumeStep);
      } else {
        bgm.volume = Math.max(0, Math.min(1, targetVolume));
      }
    };

    const syncBgmWithVideo = () => {
      if (!video || !bgm || !selectedTrack) return;
      const isSpeaking = (activeClip.segments || []).some(
        (s) => video.currentTime >= s.start && video.currentTime <= s.end
      );
      targetVolume = isSpeaking ? (activeAudio.bgmVolume * duckMultiplier) : activeAudio.bgmVolume;
      if (animFrame) cancelAnimationFrame(animFrame);
      animFrame = requestAnimationFrame(smoothVolumeStep);

      if (activeAudio.sfxEnabled && sfx && !video.paused) {
        const segs = activeClip.segments || [];
        for (let idx = 0; idx < Math.min(segs.length, 5); idx++) {
          const segStart = segs[idx]?.start || 0;
          if (Math.abs(video.currentTime - segStart) < 0.25 && !triggeredSfxTimes.has(idx)) {
            triggeredSfxTimes.add(idx);
            sfx.src = idx === 0 ? '/assets/audio/sfx/impact.wav' : idx % 2 === 1 ? '/assets/audio/sfx/pop.wav' : '/assets/audio/sfx/ding.wav';
            sfx.volume = activeAudio.sfxVolume || 0.7;
            sfx.play().catch(() => {});
          }
        }
      }
    };

    const handlePlaySync = () => {
      triggeredSfxTimes.clear();
      if (selectedTrack && bgm) {
        bgm.currentTime = (video.currentTime || 0) % 16;
        syncBgmWithVideo();
        bgm.play().catch(() => {});
      }
    };

    const handlePauseSync = () => {
      if (bgm) bgm.pause();
      if (animFrame) cancelAnimationFrame(animFrame);
    };

    video.addEventListener('play', handlePlaySync);
    video.addEventListener('pause', handlePauseSync);
    video.addEventListener('timeupdate', syncBgmWithVideo);

    return () => {
      if (animFrame) cancelAnimationFrame(animFrame);
      video.removeEventListener('play', onPlayState);
      video.removeEventListener('pause', onPauseState);
      video.removeEventListener('loadedmetadata', onLoadedMeta);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', handlePlaySync);
      video.removeEventListener('pause', handlePauseSync);
      video.removeEventListener('timeupdate', syncBgmWithVideo);
      if (bgm) bgm.pause();
    };
  }, [
    activeClipIdx,
    activeAudio.bgmTrack,
    activeAudio.bgmVolume,
    activeAudio.duckingEnabled,
    activeAudio.duckingStrength,
    activeAudio.sfxEnabled,
    activeAudio.sfxVolume,
    activeClip.segments,
    clipDur
  ]);

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
      const video = videoRef.current;
      if (!video) return;
      const maxDur = video.duration || videoDuration || clipDur || 15;

      if (e.code === 'Space') {
        e.preventDefault();
        if (video.paused) video.play().catch(() => {});
        else video.pause();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const next = Math.max(0, (video.currentTime || 0) - 1);
        video.currentTime = next;
        setVideoTime(next);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        const next = Math.min(maxDur, (video.currentTime || 0) + 1);
        video.currentTime = next;
        setVideoTime(next);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [videoDuration, clipDur]);

  const seekToClientX = (clientX) => {
    const ruler = rulerRef.current;
    const video = videoRef.current;
    if (!ruler || !video) return;
    const rect = ruler.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const effectiveDur = videoDuration || clipDur || 15;
    const newTime = (clickX / rect.width) * effectiveDur;
    video.currentTime = newTime;
    setVideoTime(newTime);
  };

  const handleRulerPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubbingRef.current = true;
    seekToClientX(e.clientX);
  };

  const handleRulerPointerMove = (e) => {
    if (!scrubbingRef.current) return;
    seekToClientX(e.clientX);
  };

  const handleRulerPointerUp = () => {
    scrubbingRef.current = false;
  };

  const handleTogglePreviewTrack = (trackId) => {
    if (previewingTrackId === trackId) {
      if (previewAudioRef.current) previewAudioRef.current.pause();
      setPreviewingTrackId(null);
    } else {
      const track = BGM_TRACKS.find((t) => t.id === trackId);
      if (!track || !track.path) return;
      if (previewAudioRef.current) {
        previewAudioRef.current.src = track.path;
        previewAudioRef.current.volume = 0.5;
        previewAudioRef.current.play().catch(() => {});
        setPreviewingTrackId(trackId);
      }
    }
  };

  const handleToggleFaceTracking = async (enabled) => {
    const currentClip = clips[activeClipIdx];
    if (enabled) {
      if (currentClip.trackedVideoPath) {
        const updated = [...clips];
        updated[activeClipIdx] = { ...currentClip, videoPath: currentClip.trackedVideoPath, faceTracking: true, lipTracking: false, splitScreen: false };
        setClips(updated);
      } else {
        setTrackingLoading(true);
        try {
          const res = await fetch('/api/face-track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clipId: currentClip.id, sourceVideoPath: currentClip.sourceVideoPath || currentClip.videoPath, videoPath: currentClip.videoPath, ratio: trackerRatio }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.error || 'Failed to track face');
          const updated = [...clips];
          updated[activeClipIdx] = { ...currentClip, trackedVideoPath: data.trackedVideoPath, videoPath: data.trackedVideoPath, faceTracking: true, lipTracking: false, splitScreen: false };
          setClips(updated);
        } catch (err) {
          alert('Gagal melacak wajah: ' + err.message);
        } finally {
          setTrackingLoading(false);
        }
      }
    } else {
      const fallbackVideo = currentClip.centerVideoPath || currentClip.sourceVideoPath || currentClip.videoPath;
      const updated = [...clips];
      updated[activeClipIdx] = { ...currentClip, videoPath: fallbackVideo, faceTracking: false };
      setClips(updated);
    }
  };

  const handleToggleLipTracking = async (enabled) => {
    const currentClip = clips[activeClipIdx];
    if (enabled) {
      if (currentClip.lipTrackedVideoPath) {
        const updated = [...clips];
        updated[activeClipIdx] = { ...currentClip, videoPath: currentClip.lipTrackedVideoPath, lipTracking: true, faceTracking: false, splitScreen: false };
        setClips(updated);
      } else {
        setLipTrackingLoading(true);
        try {
          const res = await fetch('/api/lip-track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clipId: currentClip.id, sourceVideoPath: currentClip.sourceVideoPath || currentClip.videoPath, videoPath: currentClip.videoPath, ratio: trackerRatio }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.error || 'Failed to track lip');
          const updated = [...clips];
          updated[activeClipIdx] = { ...currentClip, lipTrackedVideoPath: data.trackedVideoPath, videoPath: data.trackedVideoPath, lipTracking: true, faceTracking: false, splitScreen: false };
          setClips(updated);
        } catch (err) {
          alert('Gagal melacak gerakan bibir: ' + err.message);
        } finally {
          setLipTrackingLoading(false);
        }
      }
    } else {
      const fallbackVideo = currentClip.centerVideoPath || currentClip.sourceVideoPath || currentClip.videoPath;
      const updated = [...clips];
      updated[activeClipIdx] = { ...currentClip, videoPath: fallbackVideo, lipTracking: false };
      setClips(updated);
    }
  };

  const handleToggleSplitScreen = async (enabled) => {
    const currentClip = clips[activeClipIdx];
    if (enabled) {
      if (currentClip.splitScreenVideoPath) {
        const updated = [...clips];
        updated[activeClipIdx] = { ...currentClip, videoPath: currentClip.splitScreenVideoPath, splitScreen: true, faceTracking: false, lipTracking: false };
        setClips(updated);
      } else {
        setSplitScreenLoading(true);
        try {
          const res = await fetch('/api/split-screen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clipId: currentClip.id, sourceVideoPath: currentClip.sourceVideoPath || currentClip.videoPath, videoPath: currentClip.videoPath, ratio: trackerRatio }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.error || 'Failed to process split screen');
          const updated = [...clips];
          updated[activeClipIdx] = { ...currentClip, splitScreenVideoPath: data.splitScreenVideoPath, videoPath: data.splitScreenVideoPath, splitScreen: true, faceTracking: false, lipTracking: false };
          setClips(updated);
        } catch (err) {
          alert('Gagal split screen: ' + err.message);
        } finally {
          setSplitScreenLoading(false);
        }
      }
    } else {
      const fallbackVideo = currentClip.centerVideoPath || currentClip.sourceVideoPath || currentClip.videoPath;
      const updated = [...clips];
      updated[activeClipIdx] = { ...currentClip, videoPath: fallbackVideo, splitScreen: false };
      setClips(updated);
    }
  };

  const handleCopyPlatform = (platform) => {
    let text = '';
    if (platform === 'youtube') text = getYouTubeCopy(activeClip);
    else if (platform === 'instagram') text = getInstagramCopy(activeClip);
    else if (platform === 'tiktok') text = getTikTokCopy(activeClip);

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopyStatus(`Tersalin untuk ${platform === 'youtube' ? 'YouTube Shorts' : platform === 'instagram' ? 'Reels' : 'TikTok'}!`);
      setTimeout(() => setCopyStatus(''), 2500);
    }
  };

  const handleSave = () => {
    const finalClips = clips.map((c, i) => ({
      ...c,
      style: clipStyles[i],
      audioSettings: clipAudioSettings[i],
      brollSettings: clipBrollSettings[i],
      watermark: clipWatermarks[i],
      titleBar: clipTitleBars[i],
      viralityScore: c.viralityScore || calculateViralityScore(c),
    }));
    onSave(finalClips);
  };

  // Active step drawer ('cut' | 'captions' | 'audio' | 'visual' | 'ai' | null)
  const [activeDrawer, setActiveDrawer] = useState(null);

  const toggleDrawer = (tabId) => {
    setActiveDrawer((prev) => (prev === tabId ? null : tabId));
  };

  const formatTimecode = (sec) => {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  };

  const withSingleFrameThumb = (src) => (src ? (src.includes('#') ? src : `${src}#t=0.1`) : '');

  const effectiveDur = videoDuration || clipDur || 15;
  const playheadProgress = Math.max(0, Math.min(100, (videoTime / effectiveDur) * 100));

  const rulerTicks = [];
  const totalRulerSeconds = Math.ceil(effectiveDur);
  for (let s = 0; s <= totalRulerSeconds; s += 5) {
    const pct = (s / effectiveDur) * 100;
    if (pct <= 100) {
      rulerTicks.push({ second: s, label: formatTimecode(s), leftPct: pct });
    }
  }

  const busyMessage = trackingLoading
    ? 'OpenCV sedang melacak wajah pembicara...'
    : lipTrackingLoading
      ? 'OpenCV sedang mendeteksi gerakan bibir aktif...'
      : splitScreenLoading
        ? 'Membuat layout Podcast Split Screen...'
        : reformatting
          ? 'Merender ulang rasio & framing video...'
          : '';

  return (
    <div className={editorStyles.editorContainer}>
      <audio ref={bgmAudioRef} style={{ display: 'none' }} />
      <audio ref={sfxAudioRef} style={{ display: 'none' }} />
      <audio ref={previewAudioRef} style={{ display: 'none' }} onEnded={() => setPreviewingTrackId(null)} />

      {/* ── 1. Top Header Navigation (Alur Bersih) ── */}
      <header className={editorStyles.topHeader}>
        <div className={editorStyles.headerLeft}>
          <Link href="/" className={editorStyles.backBtn}>
            ← Beranda
          </Link>
          <div className={editorStyles.projectTitleGroup}>
            <span className={editorStyles.projectTitle}>{projectTitle || activeClip.hook || activeClip.title || 'Room Tour 2024'}</span>
            <div className={editorStyles.formatPickerRow}>
              {[
                ['9:16', '9:16'],
                ['1:1', '1:1'],
                ['9:16-blur', 'Blur BG'],
              ].map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  className={`${editorStyles.formatBtn} ${activeFormat === val ? editorStyles.formatBtnActive : ''}`}
                  disabled={Boolean(busyMessage)}
                  onClick={() => handleFormatChange(val)}
                >
                  {reformatting && activeFormat === val ? `⏳ ${lbl}` : lbl}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={editorStyles.headerRight}>
          <Link href="/library" className={editorStyles.backBtn}>
            Library 📁
          </Link>
          <button type="button" className={editorStyles.exportBtn} onClick={handleSave}>
            🚀 Export & Simpan
          </button>
        </div>
      </header>

      {/* ── 2. Workspace Body: Media (Kiri), Playback (Tengah), & Inspector (Kanan) ── */}
      <div className={editorStyles.workspaceBody}>
        <div className={`${editorStyles.topSplit} ${activeDrawer ? editorStyles.topSplitWithInspector : ''}`}>
          {/* Media Panel */}
          <div className={editorStyles.panelCard}>
            <div className={editorStyles.panelHeader}>
              <h3 className={editorStyles.panelTitle}>
                Klip Media <span className={editorStyles.clipBadgeCount}>{clips.length}</span>
              </h3>
            </div>
            <div className={editorStyles.mediaGridArea}>
              <div className={editorStyles.mediaGrid}>
                {clips.map((c, i) => {
                  const isSelected = i === activeClipIdx;
                  const dur = c.durationSec || (Number(c.endSec) - Number(c.startSec)) || 15;
                  return (
                    <button
                      key={c.id || i}
                      type="button"
                      className={editorStyles.mediaCard}
                      onClick={() => setActiveClipIdx(i)}
                    >
                      <div className={`${editorStyles.mediaThumbWrapper} ${isSelected ? editorStyles.mediaThumbActive : ''}`}>
                        <video src={withSingleFrameThumb(c.videoPath)} className={editorStyles.mediaVideoThumb} muted playsInline preload="metadata" />
                        <span className={editorStyles.mediaDurationBadge}>{formatTimecode(dur)}</span>
                      </div>
                      <span className={`${editorStyles.mediaCardLabel} ${isSelected ? editorStyles.mediaCardLabelActive : ''}`}>
                        {c.hook || c.title || `Klip ${i + 1}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className={editorStyles.mediaFooter}>
              <button
                type="button"
                className={`${editorStyles.applyAllBtn} ${styleApplied ? editorStyles.applyAllBtnSuccess : ''}`}
                onClick={applyActiveStyleToAll}
              >
                {styleApplied ? '✓ Gaya Diterapkan ke Semua Klip' : 'Terapkan Gaya ke Semua'}
              </button>
            </div>
          </div>

          {/* Playback Panel */}
          <div className={editorStyles.panelCard}>
            <div className={editorStyles.panelHeader}>
              <h3 className={editorStyles.panelTitle}>
                Pratinjau: {activeClip.hook ? `"${activeClip.hook.slice(0, 40)}..."` : `Klip ${activeClipIdx + 1}`}
              </h3>
            </div>
            <div className={editorStyles.playbackArea}>
              <div
                className={editorStyles.previewScreen}
                style={{ aspectRatio: framingMode && sourceAR ? `${sourceAR} ` : previewAspect }}
              >
                <video
                  ref={videoRef}
                  src={framingMode ? (activeClip.sourceVideoPath || activeClip.videoPath) : activeClip.videoPath}
                  className={editorStyles.mainVideo}
                  key={`${framingMode}:${activeClip.videoPath}`}
                  playsInline
                  onClick={togglePlayPause}
                  onLoadedMetadata={(e) => {
                    if (framingMode && e.currentTarget.videoWidth > 0) {
                      setSourceAR(e.currentTarget.videoWidth / e.currentTarget.videoHeight);
                    }
                  }}
                />

                {!isPlaying && !framingMode && !busyMessage && (
                  <button type="button" className={editorStyles.playCenterBtn} onClick={togglePlayPause}>
                    ▶
                  </button>
                )}

                {busyMessage && (
                  <div className={editorStyles.processingOverlay} role="status" aria-live="polite">
                    <div className={editorStyles.processingSpinner} />
                    <span className={editorStyles.processingLabel}>{busyMessage}</span>
                    <span className={editorStyles.processingSubLabel}>Mohon tunggu beberapa detik...</span>
                  </div>
                )}

                {framingMode && (
                  <div
                    ref={framingLayerRef}
                    className={editorStyles.framingLayer}
                    onPointerDown={handleFramingPointerDown}
                    onPointerMove={handleFramingPointerMove}
                    onPointerUp={handleFramingPointerUp}
                  >
                    {frameRect && (
                      <div
                        className={editorStyles.frameBox}
                        style={{
                          left: `${frameRect.x * 100}%`,
                          top: `${frameRect.y * 100}%`,
                          width: `${frameRect.w * 100}%`,
                          height: `${frameRect.h * 100}%`,
                        }}
                      />
                    )}
                  </div>
                )}

                {framingMode && (
                  <div className={editorStyles.frameBar}>
                    <span className={editorStyles.frameBarLabel}>Zoom</span>
                    <input
                      type="range"
                      min={Math.round(ZOOM_MIN * 100)}
                      max={100}
                      value={Math.round(frameZoom * 100)}
                      onChange={(e) => handleFrameZoom(Number(e.target.value) / 100)}
                      className={editorStyles.frameZoomSlider}
                    />
                    <button type="button" className={editorStyles.formatBtn} disabled={reformatting} onClick={framingReset}>↺</button>
                    <button type="button" className={editorStyles.formatBtnActive} disabled={reformatting} onClick={handleFramingApply}>
                      {reformatting ? '⏳ Menyimpan...' : '✓ Simpan'}
                    </button>
                    <button type="button" className={editorStyles.formatBtn} disabled={reformatting} onClick={exitFraming}>✕</button>
                  </div>
                )}

                {!framingMode && <BrollOverlay key={`broll-${activeClip.id || activeClipIdx}`} videoRef={videoRef} brollSettings={activeBroll} />}
                {!framingMode && <SubtitleOverlay key={`sub-${activeClip.id || activeClip.videoPath}-${activeClipIdx}`} videoRef={videoRef} segments={activeClip.segments} style={activeStyle} />}
                {!framingMode && <TitleBarOverlay videoRef={videoRef} titleBar={activeTitleBar} />}
                {activeWatermark?.enabled && !framingMode && (
                  activeWatermark.type === 'image' && activeWatermark.imagePath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeWatermark.imagePath}
                      alt="watermark"
                      className={editorStyles.wmImagePreview}
                      style={{
                        height: `${activeWatermark.sizePct}%`,
                        opacity: activeWatermark.opacity,
                        ...(wmPreviewPos(activeWatermark.position)),
                      }}
                    />
                  ) : activeWatermark.text ? (
                    <span
                      className={editorStyles.wmTextPreview}
                      style={{
                        fontSize: `${activeWatermark.sizePct}cqh`,
                        opacity: activeWatermark.opacity,
                        ...(wmPreviewPos(activeWatermark.position)),
                      }}
                    >
                      {activeWatermark.text}
                    </span>
                  ) : null
                )}
              </div>

              {/* Playback Transport Controls */}
              <div className={editorStyles.playbackControls}>
                <span className={editorStyles.timecodeText}>
                  {formatTimecode(videoTime)} / {formatTimecode(effectiveDur)}
                </span>
                <div className={editorStyles.transportButtons}>
                  <button
                    type="button"
                    className={editorStyles.transportBtn}
                    onClick={() => setActiveClipIdx((p) => Math.max(0, p - 1))}
                    title="Klip Sebelumnya"
                  >
                    ⏮
                  </button>
                  <button type="button" className={editorStyles.playPauseBtn} onClick={togglePlayPause}>
                    {isPlaying ? '⏸' : '▶'}
                  </button>
                  <button
                    type="button"
                    className={editorStyles.transportBtn}
                    onClick={() => setActiveClipIdx((p) => Math.min(clips.length - 1, p + 1))}
                    title="Klip Berikutnya"
                  >
                    ⏭
                  </button>
                </div>
                <button
                  type="button"
                  className={editorStyles.transportBtn}
                  onClick={() => videoRef.current?.requestFullscreen?.()}
                  title="Fullscreen"
                >
                  ⛶
                </button>
              </div>
            </div>
          </div>

          {/* ── 3. Interactive Step Inspector (Ter-docking di kanan tanpa dorong layout) ── */}
          {activeDrawer && (
            <div className={editorStyles.studioDrawer}>
            <div className={editorStyles.drawerHeader}>
              <span className={editorStyles.drawerTitle}>
                {activeDrawer === 'cut' && '✂️ Potong & Pengaturan Framing Video'}
                {activeDrawer === 'captions' && '✏️ Gaya Caption, Font & Subtitle'}
                {activeDrawer === 'audio' && '🔊 Pengaturan Musik Latar & Ducking Suara'}
                {activeDrawer === 'visual' && '🎨 Branding Watermark & Visual B-Roll'}
                {activeDrawer === 'ai' && '✦ AI Hook Enhancer & Copywriting Medsos'}
              </span>
              <button type="button" className={editorStyles.drawerCloseBtn} onClick={() => setActiveDrawer(null)}>
                ✕ Tutup
              </button>
            </div>

            <div className={editorStyles.drawerContentGrid}>
              {/* Tab 1: Potong & Framing */}
              {activeDrawer === 'cut' && (
                <>
                  <div className={editorStyles.controlCard}>
                    <div className={editorStyles.controlCardTitle}>
                      <span>OpenCV Face Tracking</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {trackingLoading && <span className={editorStyles.statusPillBusy}>⏳ Memproses...</span>}
                        <label className={editorStyles.switchLabel}>
                          <input
                            type="checkbox"
                            checked={Boolean(activeClip.faceTracking)}
                            disabled={Boolean(busyMessage)}
                            onChange={(e) => handleToggleFaceTracking(e.target.checked)}
                            className={editorStyles.switchInput}
                          />
                          <span className={editorStyles.switchSlider}></span>
                        </label>
                      </div>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
                      Kamera 9:16 otomatis memusatkan posisi ke wajah pembicara.
                    </p>
                  </div>

                  <div className={editorStyles.controlCard}>
                    <div className={editorStyles.controlCardTitle}>
                      <span>OpenCV Lip Tracking</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {lipTrackingLoading && <span className={editorStyles.statusPillBusy}>⏳ Memproses...</span>}
                        <label className={editorStyles.switchLabel}>
                          <input
                            type="checkbox"
                            checked={Boolean(activeClip.lipTracking)}
                            disabled={Boolean(busyMessage)}
                            onChange={(e) => handleToggleLipTracking(e.target.checked)}
                            className={editorStyles.switchInput}
                          />
                          <span className={editorStyles.switchSlider}></span>
                        </label>
                      </div>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
                      Kamera memusatkan ke orang yang saat ini sedang berbicara aktif.
                    </p>
                  </div>

                  <div className={editorStyles.controlCard}>
                    <div className={editorStyles.controlCardTitle}>
                      <span>Podcast Split Screen</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {splitScreenLoading && <span className={editorStyles.statusPillBusy}>⏳ Memproses...</span>}
                        <label className={editorStyles.switchLabel}>
                          <input
                            type="checkbox"
                            checked={Boolean(activeClip.splitScreen)}
                            disabled={Boolean(busyMessage)}
                            onChange={(e) => handleToggleSplitScreen(e.target.checked)}
                            className={editorStyles.switchInput}
                          />
                          <span className={editorStyles.switchSlider}></span>
                        </label>
                      </div>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
                      Format split vertikal bertumpuk untuk 2 orang narasumber podcast.
                    </p>
                  </div>

                  <div className={editorStyles.controlCard}>
                    <div className={editorStyles.controlCardTitle}>
                      <span>Manual Framing</span>
                      <button
                        type="button"
                        className={editorStyles.formatBtnActive}
                        disabled={Boolean(busyMessage)}
                        onClick={() => (framingMode ? exitFraming() : enterFraming())}
                      >
                        {reformatting && framingMode ? '⏳ Menyimpan...' : framingMode ? 'Tutup Framing' : 'Atur Manual Framing'}
                      </button>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
                      Drag langsung kotak di video untuk tentukan posisi crop yang pas.
                    </p>
                  </div>
                </>
              )}

              {/* Tab 2: Caption & Teks */}
              {activeDrawer === 'captions' && (
                <>
                  <div className={editorStyles.controlCard}>
                    <div className={editorStyles.controlCardTitle}>
                      <span>Preset Gaya Caption</span>
                      <button
                        type="button"
                        className={`${editorStyles.applyAllBtn} ${styleApplied ? editorStyles.applyAllBtnSuccess : ''}`}
                        onClick={applyActiveStyleToAll}
                      >
                        {styleApplied ? '✓ Diterapkan' : 'Terapkan ke Semua'}
                      </button>
                    </div>
                    <div className={editorStyles.presetChipRow}>
                      {CAPTION_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className={`${editorStyles.presetChip} ${activeStyle.font === preset.style.font && activeStyle.animation === preset.style.animation ? editorStyles.presetChipActive : ''}`}
                          onClick={() => applyCaptionStyle(preset.style)}
                        >
                          <span>{preset.emoji}</span>
                          <span>{preset.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={editorStyles.controlCard}>
                    <div className={editorStyles.controlGroup}>
                      <label className={editorStyles.controlLabel}>Font & Ukuran</label>
                      <select value={activeStyle.font} onChange={(e) => updateStyle('font', e.target.value)} className={editorStyles.input}>
                        <option>Impact</option>
                        <option>Inter</option>
                        <option>Roboto</option>
                        <option>Montserrat</option>
                        <option>Bangers</option>
                      </select>
                      <select value={activeStyle.size} onChange={(e) => updateStyle('size', e.target.value)} className={editorStyles.input}>
                        <option>Small</option>
                        <option>Medium</option>
                        <option>Large</option>
                      </select>
                    </div>
                    <div className={editorStyles.controlGroup}>
                      <label className={editorStyles.controlLabel}>Animasi Teks</label>
                      <select value={activeStyle.animation} onChange={(e) => updateStyle('animation', e.target.value)} className={editorStyles.input}>
                        <option>None</option>
                        <option>Karaoke</option>
                        <option>Pop</option>
                        <option>Slide Up</option>
                        <option>Blur</option>
                        <option>Bounce</option>
                      </select>
                    </div>
                    <div className={editorStyles.controlGroup}>
                      <label className={editorStyles.controlLabel}>Warna & Efek Teks</label>
                      <div className={editorStyles.colorPickerRow}>
                        <label className={editorStyles.colorSwatchGroup}>
                          <input
                            type="color"
                            value={activeStyle.color || '#FFFF00'}
                            onChange={(e) => updateStyle('color', e.target.value)}
                            className={editorStyles.colorInput}
                          />
                          <span className={editorStyles.colorHexCode}>{activeStyle.color || '#FFFF00'}</span>
                        </label>
                        <div className={editorStyles.effectToggleRow}>
                          <button
                            type="button"
                            className={`${editorStyles.presetChip} ${activeStyle.outline ? editorStyles.presetChipActive : ''}`}
                            onClick={() => updateStyle('outline', !activeStyle.outline)}
                          >
                            Outline
                          </button>
                          <button
                            type="button"
                            className={`${editorStyles.presetChip} ${activeStyle.shadow ? editorStyles.presetChipActive : ''}`}
                            onClick={() => updateStyle('shadow', !activeStyle.shadow)}
                          >
                            Shadow
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={editorStyles.controlCard}>
                    <div className={editorStyles.controlCardTitle}>
                      <span>Judul Pembuka (Hook Bar)</span>
                      <label className={editorStyles.switchLabel}>
                        <input
                          type="checkbox"
                          checked={Boolean(activeTitleBar?.enabled)}
                          onChange={(e) => handleTitleEnable(e.target.checked)}
                          className={editorStyles.switchInput}
                        />
                        <span className={editorStyles.switchSlider}></span>
                      </label>
                    </div>
                    {activeTitleBar?.enabled && (
                      <div className={editorStyles.controlGroup}>
                        <input
                          type="text"
                          value={activeTitleBar.text || ''}
                          onChange={(e) => handleClipTitleBar({ text: e.target.value })}
                          placeholder="Judul hook pembuka..."
                          className={editorStyles.input}
                        />
                        <div className={editorStyles.presetChipRow}>
                          {TITLE_PRESETS.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              className={`${editorStyles.presetChip} ${activeTitleBar.preset === preset.id ? editorStyles.presetChipActive : ''}`}
                              onClick={() => handleTitlePreset(preset.id)}
                            >
                              <span>{preset.emoji}</span>
                              <span>{preset.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Tab 3: Audio & Musik */}
              {activeDrawer === 'audio' && (
                <>
                  <div className={editorStyles.controlCard}>
                    <div className={editorStyles.controlGroup}>
                      <label className={editorStyles.controlLabel}>Musik Latar (BGM)</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <select
                          value={activeAudio.bgmTrack}
                          onChange={(e) => updateAudioSetting('bgmTrack', e.target.value)}
                          className={editorStyles.input}
                        >
                          {BGM_TRACKS.map((track) => (
                            <option key={track.id} value={track.id}>
                              {track.name} {track.genre !== 'Off' ? `(${track.genre})` : ''}
                            </option>
                          ))}
                        </select>
                        {activeAudio.bgmTrack !== 'none' && (
                          <button
                            type="button"
                            className={editorStyles.formatBtn}
                            onClick={() => handleTogglePreviewTrack(activeAudio.bgmTrack)}
                          >
                            {previewingTrackId === activeAudio.bgmTrack ? 'Stop' : 'Sample'}
                          </button>
                        )}
                      </div>
                    </div>

                    {activeAudio.bgmTrack !== 'none' && (
                      <div className={editorStyles.controlGroup}>
                        <label className={editorStyles.controlLabel}>Volume BGM ({Math.round(activeAudio.bgmVolume * 100)}%)</label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={activeAudio.bgmVolume}
                          onChange={(e) => updateAudioSetting('bgmVolume', parseFloat(e.target.value))}
                          style={{ accentColor: 'var(--primary)' }}
                        />
                      </div>
                    )}
                  </div>

                  <div className={editorStyles.controlCard}>
                    <div className={editorStyles.controlCardTitle}>
                      <span>Auto Audio Ducking</span>
                      <label className={editorStyles.switchLabel}>
                        <input
                          type="checkbox"
                          checked={Boolean(activeAudio.duckingEnabled)}
                          onChange={(e) => updateAudioSetting('duckingEnabled', e.target.checked)}
                          className={editorStyles.switchInput}
                        />
                        <span className={editorStyles.switchSlider}></span>
                      </label>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
                      Musik otomatis mengecil saat ada suara vokal bicara.
                    </p>
                    {activeAudio.duckingEnabled && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {['light', 'medium', 'heavy'].map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            className={`${editorStyles.presetChip} ${activeAudio.duckingStrength === lvl ? editorStyles.presetChipActive : ''}`}
                            onClick={() => updateAudioSetting('duckingStrength', lvl)}
                          >
                            {lvl === 'light' ? 'Ringan' : lvl === 'medium' ? 'Sedang' : 'Kuat'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={editorStyles.controlCard}>
                    <div className={editorStyles.controlCardTitle}>
                      <span>Efek Suara Transisi (SFX)</span>
                      <label className={editorStyles.switchLabel}>
                        <input
                          type="checkbox"
                          checked={Boolean(activeAudio.sfxEnabled)}
                          onChange={(e) => updateAudioSetting('sfxEnabled', e.target.checked)}
                          className={editorStyles.switchInput}
                        />
                        <span className={editorStyles.switchSlider}></span>
                      </label>
                    </div>
                    {activeAudio.sfxEnabled && (
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={activeAudio.sfxVolume}
                        onChange={(e) => updateAudioSetting('sfxVolume', parseFloat(e.target.value))}
                        style={{ accentColor: 'var(--primary)' }}
                      />
                    )}
                  </div>
                </>
              )}

              {/* Tab 4: Visual & Brand */}
              {activeDrawer === 'visual' && (
                <>
                  <div className={editorStyles.controlCard}>
                    <div className={editorStyles.controlCardTitle}>
                      <span>Watermark Channel</span>
                      <label className={editorStyles.switchLabel}>
                        <input
                          type="checkbox"
                          checked={Boolean(activeWatermark?.enabled)}
                          onChange={(e) => handleClipWatermark({ enabled: e.target.checked })}
                          className={editorStyles.switchInput}
                        />
                        <span className={editorStyles.switchSlider}></span>
                      </label>
                    </div>
                    {activeWatermark?.enabled && (
                      <div className={editorStyles.controlGroup}>
                        <input
                          type="text"
                          value={activeWatermark.text || ''}
                          onChange={(e) => handleClipWatermark({ type: activeWatermark.imagePath ? 'image' : 'text', text: e.target.value })}
                          placeholder="@nama_channel"
                          className={editorStyles.input}
                        />
                        <input
                          type="file"
                          accept=".png,.jpg,.jpeg,.webp"
                          onChange={handleClipLogoUpload}
                          disabled={wmUploading}
                          style={{ fontSize: '11px' }}
                        />
                      </div>
                    )}
                  </div>

                  <div className={editorStyles.controlCard}>
                    <div className={editorStyles.controlCardTitle}>
                      <span>Auto B-Roll Visual AI</span>
                      <label className={editorStyles.switchLabel}>
                        <input
                          type="checkbox"
                          checked={Boolean(activeBroll.enabled)}
                          onChange={(e) => updateBrollSetting('enabled', e.target.checked)}
                          className={editorStyles.switchInput}
                        />
                        <span className={editorStyles.switchSlider}></span>
                      </label>
                    </div>
                    {activeBroll.enabled && (
                      <div className={editorStyles.controlGroup}>
                        <select
                          value={activeBroll.theme || 'auto'}
                          onChange={(e) => handleBrollThemeChange(e.target.value)}
                          className={editorStyles.input}
                        >
                          <option value="auto">⚡ Auto Smart Match</option>
                          {BROLL_THEMES.map((th) => (
                            <option key={th.id} value={th.id}>{th.icon} {th.name}</option>
                          ))}
                        </select>
                        <button type="button" className={editorStyles.formatBtn} onClick={handleAddBrollAtCurrentTime}>
                          + Tambah Overlay di Detik Ini
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Tab 5: AI Virality */}
              {activeDrawer === 'ai' && (
                <>
                  <div className={editorStyles.controlCard}>
                    <div className={editorStyles.viralityScoreHero}>
                      <div
                        className={editorStyles.viralityGaugeWrap}
                        style={{
                          background: `conic-gradient(${viralityScore.color || '#10b981'} ${viralityScore.score * 3.6}deg, var(--bg-panel) 0deg)`,
                        }}
                      >
                        <div className={editorStyles.viralityGaugeInner}>
                          <span className={editorStyles.viralityScoreValue} style={{ color: viralityScore.color || '#10b981' }}>
                            {viralityScore.score}
                          </span>
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{viralityScore.badgeEmoji} {viralityScore.gradeLabel}</span>
                        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>{viralityScore.summary}</p>
                      </div>
                    </div>
                  </div>

                  <div className={editorStyles.controlCard}>
                    <label className={editorStyles.controlLabel}>Edit Opening Hook (3 Detik Pertama)</label>
                    <textarea
                      className={editorStyles.hookTextarea}
                      value={activeClip.hook || ''}
                      onChange={(e) => handleUpdateHook(e.target.value)}
                      rows={2}
                    />
                  </div>

                  <div className={editorStyles.controlCard}>
                    <label className={editorStyles.controlLabel}>Salin Copy Medsos</label>
                    <div className={editorStyles.platformCopyGrid}>
                      <button type="button" className={editorStyles.platformBtn} onClick={() => handleCopyPlatform('youtube')}>
                        🔴 Shorts
                      </button>
                      <button type="button" className={editorStyles.platformBtn} onClick={() => handleCopyPlatform('instagram')}>
                        📸 Reels
                      </button>
                      <button type="button" className={editorStyles.platformBtn} onClick={() => handleCopyPlatform('tiktok')}>
                        🎵 TikTok
                      </button>
                    </div>
                    {copyStatus && <span style={{ fontSize: '11px', color: '#10b981' }}>✓ {copyStatus}</span>}
                  </div>

                  {onOpenPublish && (
                    <button
                      type="button"
                      className={editorStyles.directPublishBtn}
                      onClick={() => {
                        onOpenPublish({
                          ...activeClip,
                          style: activeStyle,
                          audioSettings: activeAudio,
                          brollSettings: activeBroll,
                        });
                      }}
                    >
                      🚀 Direct Auto-Publish ke Medsos
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
        </div>

        {/* ── 4. Timeline Panel (Ruler & 3 Tracks — Selalu Terlihat Tanpa Loncat) ── */}
        <div className={editorStyles.timelinePanel}>
          <div className={editorStyles.timelineBar}>
            <span className={editorStyles.timelineTitle}>
              Timeline & Audio Track
            </span>
            {clips.length > 1 && (
              <button
                type="button"
                className={editorStyles.deleteClipBtn}
                onClick={() => {
                  const nextClips = clips.filter((_, idx) => idx !== activeClipIdx);
                  setClips(nextClips);
                  setActiveClipIdx(Math.max(0, activeClipIdx - 1));
                }}
              >
                Hapus Klip Ini
              </button>
            )}
          </div>

          <div className={editorStyles.timelineScroll}>
            {/* Ruler */}
            <div
              ref={rulerRef}
              className={editorStyles.rulerContainer}
              onPointerDown={handleRulerPointerDown}
              onPointerMove={handleRulerPointerMove}
              onPointerUp={handleRulerPointerUp}
              onPointerCancel={handleRulerPointerUp}
            >
              {rulerTicks.map((mark) => (
                <div key={mark.second} className={editorStyles.rulerMark} style={{ left: `${mark.leftPct}%` }}>
                  <span className={editorStyles.rulerNumber}>{mark.label}</span>
                  <div className={editorStyles.rulerTickLine} />
                </div>
              ))}
              <div className={editorStyles.playheadLine} style={{ left: `${playheadProgress}%` }}>
                <div className={editorStyles.playheadKnob} />
              </div>
            </div>

            {/* 3 Tracks */}
            <div className={editorStyles.tracksWrapper}>
              {/* Track 1: Text */}
              <div className={editorStyles.trackRow}>
                <div className={editorStyles.trackPill}>
                  <span style={{ color: 'var(--primary)' }}>T</span>
                  <span>Teks</span>
                </div>
                <div className={`${editorStyles.trackContentArea} ${editorStyles.textTrackHeight}`}>
                  {Array.isArray(activeClip.segments) && activeClip.segments.length > 0 ? (
                    activeClip.segments.map((seg, idx) => {
                      const leftPct = Math.max(0, Math.min(96, ((seg.start || 0) / effectiveDur) * 100));
                      const widthPct = Math.max(4, Math.min(100 - leftPct, (((seg.end || seg.start + 1) - (seg.start || 0)) / effectiveDur) * 100));
                      const isCurrent = videoTime >= (seg.start || 0) && videoTime <= (seg.end || 0);
                      return (
                        <div
                          key={`${idx}-${seg.start}`}
                          className={`${editorStyles.textClipBlock} ${isCurrent ? editorStyles.textClipBlockActive : ''}`}
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          onClick={() => {
                            if (videoRef.current) {
                              videoRef.current.currentTime = seg.start || 0;
                              setVideoTime(seg.start || 0);
                            }
                            setActiveDrawer('captions');
                          }}
                          title={`${formatTimecode(seg.start)} - ${seg.text}`}
                        >
                          <span>{seg.text}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div
                      className={editorStyles.textClipBlock}
                      style={{ left: '0%', width: '90%' }}
                      onClick={() => toggleDrawer('captions')}
                      title="Klik untuk ubah teks / caption"
                    >
                      <span>T</span>
                      <span>{activeClip.hook || activeClip.title || 'Subtitle Klip'}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Track 2: Video (100% Active Clip + B-Roll Markers) */}
              <div className={editorStyles.trackRow}>
                <div className={editorStyles.trackPill}>
                  <span>📹</span>
                  <span>Video</span>
                </div>
                <div
                  className={`${editorStyles.trackContentArea} ${editorStyles.videoTrackHeight}`}
                  onClick={(e) => seekToClientX(e.clientX)}
                  title="Klik di sepanjang track video untuk loncat ke detik tersebut"
                >
                  <div className={editorStyles.videoClipsRow}>
                    <div
                      className={`${editorStyles.videoClipItem} ${editorStyles.videoClipSelected}`}
                      style={{ flex: 1 }}
                    >
                      <video src={withSingleFrameThumb(activeClip.videoPath)} className={editorStyles.videoClipThumb} muted playsInline preload="metadata" />
                      {activeBroll?.enabled &&
                        Array.isArray(activeBroll.overlays) &&
                        activeBroll.overlays.map((ov) => {
                          const leftPct = Math.max(0, Math.min(94, ((ov.start || 0) / effectiveDur) * 100));
                          const widthPct = Math.max(6, Math.min(100 - leftPct, ((ov.duration || 2.5) / effectiveDur) * 100));
                          return (
                            <div
                              key={ov.id}
                              className={editorStyles.brollTimelineChip}
                              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (videoRef.current) {
                                  videoRef.current.currentTime = ov.start || 0;
                                  setVideoTime(ov.start || 0);
                                }
                                setActiveDrawer('visual');
                              }}
                              title={`B-Roll: ${ov.label || ov.themeName} (${formatTimecode(ov.start)})`}
                            >
                              <span>{ov.icon || '🎬'} {ov.themeName || 'B-Roll'}</span>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveBrollOverlay(ov.id);
                                }}
                                title="Hapus B-Roll ini"
                                style={{ marginLeft: 'auto', cursor: 'pointer', opacity: 0.8 }}
                              >
                                ✕
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Track 3: Audio */}
              <div className={editorStyles.trackRow}>
                <div className={editorStyles.trackPill}>
                  <span style={{ color: 'var(--audio)' }}>🎵</span>
                  <span>Audio</span>
                </div>
                <div className={`${editorStyles.trackContentArea} ${editorStyles.audioTrackHeight}`}>
                  <div
                    className={editorStyles.audioClipBlock}
                    style={{ width: '100%' }}
                    onClick={() => toggleDrawer('audio')}
                    title="Klik untuk atur BGM & Ducking"
                  >
                    <span>🎵 {activeAudio.bgmTrack !== 'none' ? `Voice Over + ${activeAudio.bgmTrack}` : 'Voice Over'}</span>
                    <svg className={editorStyles.audioWaveform} viewBox="0 0 100 20" preserveAspectRatio="none">
                      <path d="M0,10 Q5,2 10,10 T20,10 T30,3 T40,17 T50,7 T60,14 T70,5 T80,15 T90,8 T100,10" strokeWidth="2" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 5. Bottom Mode Tabs (Alur Proses 5 Langkah) ── */}
        <div className={editorStyles.bottomModeBar}>
          <div className={editorStyles.segmentedControls}>
            {[
              { id: 'cut', label: '1. Potong & Framing', icon: '✂️' },
              { id: 'captions', label: '2. Caption & Teks', icon: '✏️' },
              { id: 'audio', label: '3. Audio & Musik', icon: '🔊' },
              { id: 'visual', label: '4. Visual & Brand', icon: '🎨' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`${editorStyles.stepTab} ${activeDrawer === tab.id ? editorStyles.stepTabActive : ''}`}
                onClick={() => toggleDrawer(tab.id)}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className={editorStyles.aiTabBtn}
            onClick={() => toggleDrawer('ai')}
          >
            <span>✦</span>
            <span>5. AI Virality</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function EditorialContent() {
  const searchParams = useSearchParams();
  const url = searchParams.get('url');
  const localFilePath = searchParams.get('localFilePath');
  const fileName = searchParams.get('fileName');
  const ratio = searchParams.get('ratio') || '9:16';
  const language = searchParams.get('language') || 'auto';
  const subtitlesOption = searchParams.get('subtitles') !== 'false';
  const fontOption = searchParams.get('font') || 'Inter';
  const sizeOption = searchParams.get('size') || 'Medium';
  const colorOption = searchParams.get('color') || '#FFFF00';
  const wmEnabledParam = searchParams.get('wmEnabled') === 'true';
  const wmTypeParam = searchParams.get('wmType') === 'image' ? 'image' : 'text';
  const wmTextParam = searchParams.get('wmText') || '';
  const wmLogoParam = searchParams.get('wmLogo') || '';
  const wmPosParam = searchParams.get('wmPos') || 'top-right';
  const wmSizeParam = Number(searchParams.get('wmSize')) || 6;
  const wmOpacityParam = Number(searchParams.get('wmOpacity'));
  const initialWatermark = !wmEnabledParam ? null : {
    enabled: true,
    type: wmTypeParam === 'image' && wmLogoParam ? 'image' : 'text',
    text: wmTextParam,
    imagePath: wmLogoParam,
    position: ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(wmPosParam) ? wmPosParam : 'top-right',
    sizePct: wmSizeParam,
    opacity: Number.isFinite(wmOpacityParam) ? wmOpacityParam : 0.7,
  };

  const [status, setStatus] = useState('analyzing');
  const [errorMessage, setErrorMessage] = useState('');
  const [preparedClips, setPreparedClips] = useState([]);
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [publishModalClip, setPublishModalClip] = useState(null);

  const videoId = getYouTubeId(url);

  useEffect(() => {
    let isMounted = true;

    async function processVideo() {
      try {
        if (!url && !localFilePath) throw new Error('No video URL or file provided.');

        const analyzeRes = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, localFilePath, fileName, language }),
        });

        if (!analyzeRes.ok) {
          const errData = await analyzeRes.json().catch(() => ({}));
          throw new Error(errData.error || errData.details || 'Failed to analyze video');
        }
        const analyzeData = await analyzeRes.json();
        const clips = analyzeData.clips;
        if (!clips || clips.length === 0) throw new Error('No engaging clips found by the algorithm.');

        if (isMounted) setStatus('preparing');

        const prepRes = await fetch('/api/prepare-editor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, localFilePath, clips, ratio, language }),
        });

        if (!prepRes.ok) {
          const prepErr = await prepRes.json().catch(() => ({}));
          throw new Error(prepErr.error || prepErr.details || 'Failed to prepare clips');
        }
        const prepData = await prepRes.json();

        if (isMounted) {
          setPreparedClips(prepData.clips);
          setStatus('editing');
        }
      } catch (err) {
        if (isMounted) {
          setStatus('error');
          setErrorMessage(err.message || 'An unknown error occurred');
        }
      }
    }

    processVideo();
    return () => {
      isMounted = false;
    };
  }, [url, localFilePath, fileName, ratio, language]);

  const handleSaveFinal = async (finalClips) => {
    setStatus('rendering');
    try {
      const renderRes = await fetch('/api/render-final', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clips: finalClips }),
      });
      if (!renderRes.ok) throw new Error('Failed to render final clips');
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err.message || 'Failed to render final clips');
    }
  };

  const steps = [
    { id: 'analyzing', label: 'Menganalisis Konten', description: 'Transkripsi kata & pencarian hook' },
    { id: 'preparing', label: 'Menyiapkan Editor', description: 'Ekstraksi video & pemotongan klip' },
    { id: 'rendering', label: 'Merender Klip', description: 'Memasang subtitle & audio mixing' },
    { id: 'done', label: 'Selesai', description: 'Tersimpan di pustaka Anda' },
  ];

  const effectiveStatus = status === 'error' ? 'analyzing' : status;
  const currentStepIndex = steps.findIndex((s) => s.id === effectiveStatus);

  if (status === 'editing') {
    return (
      <>
        <EditorStudio
          clips={preparedClips}
          onSave={handleSaveFinal}
          onOpenPublish={setPublishModalClip}
          ratio={ratio}
          initialStyle={{
            subtitles: subtitlesOption,
            font: fontOption,
            size: sizeOption,
            color: colorOption,
          }}
          initialWatermark={initialWatermark}
          projectTitle={fileName || preparedClips[0]?.title || 'Room Tour 2024'}
        />

        <WebhookModal isOpen={isWebhookModalOpen} onClose={() => setIsWebhookModalOpen(false)} />
        <DirectPublishModal isOpen={Boolean(publishModalClip)} clip={publishModalClip} onClose={() => setPublishModalClip(null)} />
      </>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/" className={styles.backLink}>
            ← Beranda
          </Link>
          <span className={styles.projectTitle}>{fileName || 'Pemrosesan Video'}</span>
        </div>
        <div className={styles.headerRight}>
          <WebhookTriggerButton onClick={() => setIsWebhookModalOpen(true)} />
          <Link href="/library" className={styles.libraryLink}>
            Library →
          </Link>
        </div>
      </header>

      <main className={styles.mainGrid}>
        <div className={styles.videoSection}>
          <div className={styles.videoWrapper}>
            {localFilePath ? (
              <video className={styles.localVideoPlayer} src={localFilePath} controls autoPlay muted loop playsInline />
            ) : videoId ? (
              <iframe
                className={styles.iframe}
                src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1`}
                title="YouTube player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className={styles.noVideo}>
                <div className={styles.noVideoIcon}>🎬</div>
                <p className={styles.noVideoTitle}>{fileName || url || 'Stream Video'}</p>
                <p className={styles.noVideoSub}>Memproses media & mencari hook viral...</p>
              </div>
            )}
          </div>
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h2 className={styles.sidebarTitle}>Status Alur</h2>
            <span className={styles.ratioBadge}>{ratio}</span>
          </div>

          {status === 'error' ? (
            <div className={styles.errorCard}>
              <div className={styles.errorIcon}>!</div>
              <h3 className={styles.cardTitle}>Gagal Memproses</h3>
              <p className={styles.cardDesc}>{errorMessage}</p>
              <Link href="/" className={styles.secondaryButton}>
                ← Kembali ke Beranda
              </Link>
            </div>
          ) : (
            <div className={styles.stepper}>
              {steps.map((step, index) => {
                const isCompleted = currentStepIndex > index || status === 'done';
                const isActive = status === step.id;
                return (
                  <div key={step.id} className={`${styles.step} ${isActive ? styles.stepActive : ''} ${isCompleted ? styles.stepCompleted : ''}`}>
                    <div className={styles.stepIndicator}>
                      <div className={styles.dot} />
                      {index < steps.length - 1 && <div className={styles.line} />}
                    </div>
                    <div className={styles.stepContent}>
                      <div className={styles.stepLabel}>{step.label}</div>
                      <div className={styles.stepDesc}>{step.description}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {status === 'done' && (
            <div className={styles.doneCard}>
              <div className={styles.doneIcon}>✓</div>
              <h3 className={styles.cardTitle}>Selesai Dirender</h3>
              <p className={styles.cardDesc}>Klip siap diunduh di pustaka Anda.</p>
              <Link href="/library" className={styles.primaryButton}>
                Buka Library →
              </Link>
            </div>
          )}
        </aside>
      </main>

      <WebhookModal isOpen={isWebhookModalOpen} onClose={() => setIsWebhookModalOpen(false)} />
      <DirectPublishModal isOpen={Boolean(publishModalClip)} clip={publishModalClip} onClose={() => setPublishModalClip(null)} />
    </div>
  );
}

export default function EditorialPage() {
  return (
    <Suspense fallback={<div className={styles.loadingPulse}>Memuat editor...</div>}>
      <EditorialContent />
    </Suspense>
  );
}
