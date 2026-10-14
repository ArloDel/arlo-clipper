'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ThemeToggle from '@/app/components/ThemeToggle';
import WebhookModal, { WebhookTriggerButton } from '@/app/components/WebhookModal';
import DirectPublishModal, { DirectPublishTriggerButton } from '@/app/components/DirectPublishModal';
import AppLogo from '@/app/components/AppLogo';
import { getYouTubeCopy, getInstagramCopy, getTikTokCopy } from '@/lib/socialCopy';
import { BGM_TRACKS } from '@/lib/audioCatalog';
import { BROLL_THEMES, detectAutoBroll } from '@/lib/brollCatalog';
import { CAPTION_PRESETS } from '@/lib/captionPresets';
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
  if (Array.isArray(seg.words) && seg.words.length > 0) {
    return seg.words;
  }
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

    let animFrameId = null;

    const updateTime = () => {
      if (video) {
        setCurrentTime(video.currentTime);
        if (!video.paused && !video.ended) {
          animFrameId = requestAnimationFrame(updateTime);
        }
      }
    };

    const handlePlay = () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      animFrameId = requestAnimationFrame(updateTime);
    };

    const handlePauseOrSeek = () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (video) setCurrentTime(video.currentTime);
    };

    setCurrentTime(video.currentTime || 0);

    video.addEventListener('play', handlePlay);
    video.addEventListener('playing', handlePlay);
    video.addEventListener('pause', handlePauseOrSeek);
    video.addEventListener('seeking', handlePauseOrSeek);
    video.addEventListener('seeked', handlePauseOrSeek);
    video.addEventListener('timeupdate', handlePauseOrSeek);

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('playing', handlePlay);
      video.removeEventListener('pause', handlePauseOrSeek);
      video.removeEventListener('seeking', handlePauseOrSeek);
      video.removeEventListener('seeked', handlePauseOrSeek);
      video.removeEventListener('timeupdate', handlePauseOrSeek);
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

function SubtitleOverlay({ videoRef, segments, style }) {
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;

    let animFrameId = null;

    const updateTime = () => {
      if (video) {
        setCurrentTime(video.currentTime);
        if (!video.paused && !video.ended) {
          animFrameId = requestAnimationFrame(updateTime);
        }
      }
    };

    const handlePlay = () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      animFrameId = requestAnimationFrame(updateTime);
    };

    const handlePauseOrSeek = () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (video) setCurrentTime(video.currentTime);
    };

    setCurrentTime(video.currentTime || 0);

    video.addEventListener('play', handlePlay);
    video.addEventListener('playing', handlePlay);
    video.addEventListener('pause', handlePauseOrSeek);
    video.addEventListener('seeking', handlePauseOrSeek);
    video.addEventListener('seeked', handlePauseOrSeek);
    video.addEventListener('timeupdate', handlePauseOrSeek);

    if (!video.paused && !video.ended) {
      animFrameId = requestAnimationFrame(updateTime);
    }

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('playing', handlePlay);
      video.removeEventListener('pause', handlePauseOrSeek);
      video.removeEventListener('seeking', handlePauseOrSeek);
      video.removeEventListener('seeked', handlePauseOrSeek);
      video.removeEventListener('timeupdate', handlePauseOrSeek);
    };
  }, [videoRef, segments]);

  const activeSeg = (segments || []).find((s) => currentTime >= s.start && currentTime <= s.end);
  if (!activeSeg) return null;

  const sizeMap = { small: '1.15rem', medium: '1.5rem', large: '2.0rem' };
  const fontSize = sizeMap[style.size?.toLowerCase()] || '1.5rem';

  const textShadow = [
    style.shadow ? '0px 2px 5px rgba(0,0,0,0.7)' : '',
    style.outline ? '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000' : '',
  ]
    .filter(Boolean)
    .join(', ');

  const isKaraoke = style.animation === 'Karaoke';

  if (isKaraoke) {
    const words = getSegmentWords(activeSeg);
    let highlightColor = style.color || '#FFFF00';
    if (highlightColor.toLowerCase() === '#ffffff' || highlightColor.toLowerCase() === '#fff') {
      highlightColor = '#FFFF00';
    }

    return (
      <div
        className={editorStyles.subtitleOverlay}
        style={{
          fontFamily: style.font || 'Impact',
          fontSize: fontSize,
        }}
      >
        <div className={editorStyles.karaokeContainer}>
          {words.map((w, idx) => {
            const isCurrent =
              currentTime >= w.start &&
              (words[idx + 1] && words[idx + 1].start > w.start
                ? currentTime < Math.min(w.end + 0.15, words[idx + 1].start)
                : currentTime <= w.end + 0.15);
            const isPast =
              currentTime > (words[idx + 1] ? words[idx + 1].start : w.end + 0.15);

            const wordColor = isCurrent ? highlightColor : '#FFFFFF';
            const wordShadow = isCurrent
              ? `0 0 16px ${highlightColor}, 0 0 6px ${highlightColor}${textShadow ? ', ' + textShadow : ', -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000'}`
              : (textShadow || 'none');

            return (
              <span
                key={idx}
                className={`${editorStyles.karaokeWord} ${
                  isCurrent ? editorStyles.karaokeWordActive : ''
                } ${isPast ? editorStyles.karaokeWordPast : ''}`}
                style={{
                  color: wordColor,
                  textShadow: wordShadow,
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
      case 'Pop':
        return editorStyles.animatePop;
      case 'Slide Up':
        return editorStyles.animateSlideUp;
      case 'Blur':
        return editorStyles.animateBlur;
      case 'Bounce':
        return editorStyles.animateBounce;
      default:
        return '';
    }
  };

  return (
    <div
      key={`${activeSeg.text}-${style.animation}`}
      className={`${editorStyles.subtitleOverlay} ${getAnimationClass(style.animation)}`}
      style={{
        fontFamily: style.font || 'Impact',
        fontSize: fontSize,
        color: style.color || '#FFFF00',
        textShadow: textShadow || 'none',
      }}
    >
      {activeSeg.text}
    </div>
  );
}

function EditorStudio({ clips: initialClips, onSave, onOpenPublish, ratio, initialStyle, initialWatermark }) {
  const [activeClipIdx, setActiveClipIdx] = useState(0);
  const [clips, setClips] = useState(initialClips);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [lipTrackingLoading, setLipTrackingLoading] = useState(false);
  const [splitScreenLoading, setSplitScreenLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  
  // Style settings per clip (initial values honor the Home page options)
  const [clipStyles, setClipStyles] = useState(
    initialClips.map(() => ({
      font: initialStyle?.font || 'Impact',
      size: initialStyle?.size || 'Medium',
      color: initialStyle?.color || '#FFFF00',
      outline: true,
      shadow: true,
      animation: 'Pop',
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

  // Watermark (branding) per clip — defaults from the Home page branding panel
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
  const [previewingTrackId, setPreviewingTrackId] = useState(null);

  const activeClip = clips[activeClipIdx] || {};
  const activeStyle = clipStyles[activeClipIdx] || {};
  const activeAudio = clipAudioSettings[activeClipIdx] || {};
  const activeBroll = clipBrollSettings[activeClipIdx] || {};
  const activeWatermark = clipWatermarks[activeClipIdx] || null;

  // CSS anchor aliases matching the ASS/ffmpeg positions for the live preview
  const wmPreviewPos = (position) => {
    const [vertical, horizontal] = String(position || 'top-right').split('-');
    return {
      [vertical === 'bottom' ? 'bottom' : 'top']: '2.8%',
      [horizontal === 'left' ? 'left' : 'right']: '3.5%',
    };
  };

  // Per-clip output format ('9:16' | '1:1' | '9:16-blur'); initially baked by prepare-editor
  const normalizeFormat = (r) => (r === '1:1' ? '1:1' : r === '9:16-blur' ? '9:16-blur' : '9:16');
  const [clipFormats, setClipFormats] = useState(initialClips.map(() => normalizeFormat(ratio)));
  const [reformatting, setReformatting] = useState(false);

  const activeFormat = clipFormats[activeClipIdx] || '9:16';
  const previewAspect = activeFormat === '1:1' ? '1 / 1' : '9 / 16';
  // OpenCV trackers only understand 9:16 / 1:1 / 16:9; blur falls back to 9:16 crop there
  const trackerRatio = activeFormat === '9:16-blur' ? '9:16' : activeFormat;

  // ── Manual Framing (pan + zoom over the untouched source slice) ──
  const [framingMode, setFramingMode] = useState(false);
  const [frameRect, setFrameRect] = useState(null); // normalized {x,y,w,h} on source
  const [frameZoom, setFrameZoom] = useState(1);
  const [sourceAR, setSourceAR] = useState(null); // source video aspect (w/h) from metadata
  const [clipKeyframes, setClipKeyframes] = useState(initialClips.map(() => null)); // per-clip crop keyframes
  const [keyframes, setKeyframes] = useState(null); // working copy while in framing mode
  const [activeKfId, setActiveKfId] = useState(null);
  const framingLayerRef = useRef(null);
  const framingDragRef = useRef(null);
  const kfTimelineRef = useRef(null);
  const kfDotDragRef = useRef(null);
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
    x: Math.min(1 - rect.w, Math.max(0, rect.x)),
    y: Math.min(1 - rect.h, Math.max(0, rect.y)),
    w: rect.w,
    h: rect.h,
  });

  const centerFrameRect = () => {
    const { w, h } = sizeFrameBox(1);
    return clampFrameRect({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
  };

  // Sync the active keyframe whenever the box moves/zooms (pure updaters only)
  const shiftBox = (dx, dy) => {
    setFrameRect((prev) => clampFrameRect({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    setKeyframes((prev) => {
      if (!prev) return prev;
      return prev.map((kf) =>
        kf._id === activeKfId ? clampFrameRect({ ...kf, x: kf.x + dx, y: kf.y + dy }) : kf
      );
    });
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

  // Click anywhere on the source frame moves the box center there, clamped
  const handleFramingPointerDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const layer = framingLayerRef.current;
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    framingDragRef.current = rect;
    placeBoxCenterAt(px / rect.width, py / rect.height);
  };

  const handleFramingPointerMove = (e) => {
    if (!framingDragRef.current || !framingDragRef.current.width) return;
    const rect = framingLayerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    placeBoxCenterAt(px / rect.width, py / rect.height);
  };

  const handleFramingPointerUp = () => {
    framingDragRef.current = null;
  };

  const handleFrameZoom = (zoom) => {
    const z = Math.max(ZOOM_MIN, Math.min(1, zoom));
    setFrameZoom(z);
    // Keep every keyframe's center; resize all windows so server parity holds
    const resize = (rect, w, h) => clampFrameRect({ x: rect.x + rect.w / 2 - w / 2, y: rect.y + rect.h / 2 - h / 2, w, h });
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

  // ── Crop keyframes (animated pan) ──
  const nextKfId = () => `_kf${kfIdRef.current++}`;

  const kfInterpolateRect = (kfs, t) => {
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
  };

  // Live preview: box follows the video clock while playing (>1 keyframes only)
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
  }, [framingMode, keyframes]);

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
      prev
        ? prev.map((kf) => (kf._id === id ? { ...kf, t: Math.max(0, Math.min(clipDur, t)) } : kf))
        : prev
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

  // Timeline: click empty area = add keyframe at that time
  const kfTimelineDown = (e) => {
    const track = kfTimelineRef.current;
    if (!track) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = track.getBoundingClientRect();
    const t = Math.max(0, Math.min(clipDur, ((e.clientX - rect.left) / rect.width) * clipDur));
    kfAddAt(t);
  };
  const kfTimelineUp = () => {};

  // Dot drag: move the keyframe's time; resort on release

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
      alert('Clip ini tidak menyimpan data slicing; tidak bisa mengubah format. Silakan proses ulang dari Home.');
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
    const newScore = calculateViralityScore({
      ...curr,
      hook: newHook,
    });
    updatedClips[activeClipIdx] = {
      ...curr,
      hook: newHook,
      viralityScore: newScore,
    };
    setClips(updatedClips);
  };

  const updateStyle = (key, val) => {
    const newStyles = [...clipStyles];
    newStyles[activeClipIdx] = { ...newStyles[activeClipIdx], [key]: val };
    setClipStyles(newStyles);
  };

  /** Apply a full caption style bundle (preset) to the active clip. */
  const applyCaptionStyle = (style) => {
    const newStyles = [...clipStyles];
    newStyles[activeClipIdx] = { ...newStyles[activeClipIdx], ...style };
    setClipStyles(newStyles);
  };

  /** Copy the active clip's caption style onto every clip. */
  const applyActiveStyleToAll = () => {
    const source = clipStyles[activeClipIdx];
    if (!source) return;
    setClipStyles(clipStyles.map(() => ({ ...source })));
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
    newBroll[activeClipIdx] = {
      ...newBroll[activeClipIdx],
      theme: newTheme,
      overlays: newOverlays,
    };
    setClipBrollSettings(newBroll);
  };

  const handleRemoveBrollOverlay = (overlayId) => {
    const newBroll = [...clipBrollSettings];
    const currentOverlays = newBroll[activeClipIdx]?.overlays || [];
    newBroll[activeClipIdx] = {
      ...newBroll[activeClipIdx],
      overlays: currentOverlays.filter((o) => o.id !== overlayId),
    };
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
      keyword: 'Manual Highlight',
      label: `${themeObj.icon} ${themeObj.name} (Custom)`,
    };

    const newBroll = [...clipBrollSettings];
    const currentOverlays = [...(newBroll[activeClipIdx]?.overlays || []), newOverlay].sort((a, b) => a.start - b.start);
    newBroll[activeClipIdx] = {
      ...newBroll[activeClipIdx],
      overlays: currentOverlays,
    };
    setClipBrollSettings(newBroll);
  };

  // Synchronized in-browser BGM Ducking & SFX triggers with Video
  useEffect(() => {
    const video = videoRef.current;
    const bgm = bgmAudioRef.current;
    const sfx = sfxAudioRef.current;
    if (!video || !bgm) return;

    const selectedTrack = BGM_TRACKS.find((t) => t.id === activeAudio.bgmTrack && t.id !== 'none');
    if (!selectedTrack || !selectedTrack.path) {
      bgm.pause();
    } else {
      if (bgm.src !== window.location.origin + selectedTrack.path && !bgm.src.endsWith(selectedTrack.path)) {
        bgm.src = selectedTrack.path;
      }
      bgm.loop = true;
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

      // Trigger live preview SFX on hook or key segment starts
      if (activeAudio.sfxEnabled && sfx && !video.paused) {
        const segs = activeClip.segments || [];
        for (let idx = 0; idx < Math.min(segs.length, 5); idx++) {
          const segStart = segs[idx]?.start || 0;
          if (Math.abs(video.currentTime - segStart) < 0.25 && !triggeredSfxTimes.has(idx)) {
            triggeredSfxTimes.add(idx);
            const sfxChoice = idx === 0 ? '/assets/audio/sfx/impact.wav' : idx % 2 === 1 ? '/assets/audio/sfx/pop.wav' : '/assets/audio/sfx/ding.wav';
            sfx.src = sfxChoice;
            sfx.volume = activeAudio.sfxVolume || 0.7;
            sfx.play().catch(() => {});
          }
        }
      }
    };

    const handlePlay = () => {
      triggeredSfxTimes.clear();
      if (selectedTrack) {
        bgm.currentTime = (video.currentTime || 0) % 16;
        syncBgmWithVideo();
        bgm.play().catch(() => {});
      }
    };

    const handlePause = () => {
      bgm.pause();
      if (animFrame) cancelAnimationFrame(animFrame);
    };

    const handleTimeUpdate = () => {
      syncBgmWithVideo();
    };

    const handleSeek = () => {
      triggeredSfxTimes.clear();
      if (selectedTrack) {
        bgm.currentTime = (video.currentTime || 0) % 16;
        syncBgmWithVideo();
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('seeking', handleSeek);
    video.addEventListener('seeked', handleSeek);

    return () => {
      if (animFrame) cancelAnimationFrame(animFrame);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('seeking', handleSeek);
      video.removeEventListener('seeked', handleSeek);
      bgm.pause();
    };
  }, [
    activeClipIdx,
    activeAudio.bgmTrack,
    activeAudio.bgmVolume,
    activeAudio.duckingEnabled,
    activeAudio.duckingStrength,
    activeAudio.sfxEnabled,
    activeAudio.sfxVolume,
    activeClip.segments
  ]);

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
        updated[activeClipIdx] = {
          ...currentClip,
          videoPath: currentClip.trackedVideoPath,
          faceTracking: true,
          lipTracking: false,
          splitScreen: false,
        };
        setClips(updated);
      } else {
        setTrackingLoading(true);
        try {
          const res = await fetch('/api/face-track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clipId: currentClip.id,
              sourceVideoPath: currentClip.sourceVideoPath || currentClip.videoPath,
              videoPath: currentClip.videoPath,
              ratio: trackerRatio,
            }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Failed to track face');
          }
          const updated = [...clips];
          updated[activeClipIdx] = {
            ...currentClip,
            trackedVideoPath: data.trackedVideoPath,
            videoPath: data.trackedVideoPath,
            faceTracking: true,
            lipTracking: false,
            splitScreen: false,
          };
          setClips(updated);
        } catch (err) {
          console.error('Face tracking error:', err);
          alert('Gagal melacak wajah: ' + err.message);
        } finally {
          setTrackingLoading(false);
        }
      }
    } else {
      const fallbackVideo = currentClip.centerVideoPath || currentClip.sourceVideoPath || currentClip.videoPath;
      const updated = [...clips];
      updated[activeClipIdx] = {
        ...currentClip,
        videoPath: fallbackVideo,
        faceTracking: false,
      };
      setClips(updated);
    }
  };

  const handleToggleLipTracking = async (enabled) => {
    const currentClip = clips[activeClipIdx];
    if (enabled) {
      if (currentClip.lipTrackedVideoPath) {
        const updated = [...clips];
        updated[activeClipIdx] = {
          ...currentClip,
          videoPath: currentClip.lipTrackedVideoPath,
          lipTracking: true,
          faceTracking: false,
          splitScreen: false,
        };
        setClips(updated);
      } else {
        setLipTrackingLoading(true);
        try {
          const res = await fetch('/api/lip-track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clipId: currentClip.id,
              sourceVideoPath: currentClip.sourceVideoPath || currentClip.videoPath,
              videoPath: currentClip.videoPath,
              ratio: trackerRatio,
            }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Failed to track lip movement');
          }
          const updated = [...clips];
          updated[activeClipIdx] = {
            ...currentClip,
            lipTrackedVideoPath: data.trackedVideoPath,
            videoPath: data.trackedVideoPath,
            lipTracking: true,
            faceTracking: false,
            splitScreen: false,
          };
          setClips(updated);
        } catch (err) {
          console.error('Lip tracking error:', err);
          alert('Gagal melacak gerakan bibir: ' + err.message);
        } finally {
          setLipTrackingLoading(false);
        }
      }
    } else {
      const fallbackVideo = currentClip.centerVideoPath || currentClip.sourceVideoPath || currentClip.videoPath;
      const updated = [...clips];
      updated[activeClipIdx] = {
        ...currentClip,
        videoPath: fallbackVideo,
        lipTracking: false,
      };
      setClips(updated);
    }
  };

  const handleToggleSplitScreen = async (enabled) => {
    const currentClip = clips[activeClipIdx];
    if (enabled) {
      if (currentClip.splitScreenVideoPath) {
        const updated = [...clips];
        updated[activeClipIdx] = {
          ...currentClip,
          videoPath: currentClip.splitScreenVideoPath,
          splitScreen: true,
          faceTracking: false,
          lipTracking: false,
        };
        setClips(updated);
      } else {
        setSplitScreenLoading(true);
        try {
          const res = await fetch('/api/split-screen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clipId: currentClip.id,
              sourceVideoPath: currentClip.sourceVideoPath || currentClip.videoPath,
              videoPath: currentClip.videoPath,
              ratio: trackerRatio,
            }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Failed to process split screen');
          }
          const updated = [...clips];
          updated[activeClipIdx] = {
            ...currentClip,
            splitScreenVideoPath: data.splitScreenVideoPath,
            videoPath: data.splitScreenVideoPath,
            splitScreen: true,
            faceTracking: false,
            lipTracking: false,
          };
          setClips(updated);
        } catch (err) {
          console.error('Split screen error:', err);
          alert('Gagal memproses split screen: ' + err.message);
        } finally {
          setSplitScreenLoading(false);
        }
      }
    } else {
      const fallbackVideo = currentClip.centerVideoPath || currentClip.sourceVideoPath || currentClip.videoPath;
      const updated = [...clips];
      updated[activeClipIdx] = {
        ...currentClip,
        videoPath: fallbackVideo,
        splitScreen: false,
      };
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
      setCopyStatus(`Tersalin untuk ${platform === 'youtube' ? 'YouTube Shorts' : platform === 'instagram' ? 'Instagram Reels' : 'TikTok'}!`);
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
      viralityScore: c.viralityScore || calculateViralityScore(c),
    }));
    onSave(finalClips);
  };

  return (
    <div className={editorStyles.editorContainer}>
      {/* Hidden Audio Players for in-browser BGM sync & preview */}
      <audio ref={bgmAudioRef} style={{ display: 'none' }} />
      <audio ref={sfxAudioRef} style={{ display: 'none' }} />
      <audio
        ref={previewAudioRef}
        style={{ display: 'none' }}
        onEnded={() => setPreviewingTrackId(null)}
      />

      <div className={editorStyles.previewSection}>
        <div className={editorStyles.tabs}>
          {clips.map((c, i) => (
            <button
              key={c.id || i}
              className={`${editorStyles.tab} ${i === activeClipIdx ? editorStyles.activeTab : ''}`}
              onClick={() => setActiveClipIdx(i)}
            >
              Clip {i + 1}
            </button>
          ))}
        </div>

        {/* Per-clip output format switcher */}
        <div className={editorStyles.formatRow}>
          <span className={editorStyles.formatLabel}>Format:</span>
          {[
            ['9:16', '9:16 Portrait'],
            ['1:1', '1:1 Square'],
            ['9:16-blur', '9:16 Blur BG'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`${editorStyles.formatBtn} ${activeFormat === value ? editorStyles.formatBtnActive : ''}`}
              disabled={reformatting}
              onClick={() => handleFormatChange(value)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className={`${editorStyles.formatBtn} ${framingMode ? editorStyles.formatBtnActive : ''}`}
            disabled={activeFormat === '9:16-blur' || reformatting}
            title={activeFormat === '9:16-blur' ? 'Framing tidak berlaku untuk format Blur Background (komposisi penuh dipertahankan)' : 'Atur posisi & zoom frame secara manual'}
            onClick={() => (framingMode ? exitFraming() : enterFraming())}
          >
            ✋ Framing
          </button>
          {framingMode && (
            <>
              <button
                type="button"
                className={editorStyles.formatBtn}
                disabled={reformatting}
                onClick={framingReset}
              >
                ↺ Reset
              </button>
              <button
                type="button"
                className={editorStyles.formatBtn}
                disabled={reformatting}
                onClick={handleFramingApply}
              >
                ✓ Terapkan
              </button>
              <button
                type="button"
                className={editorStyles.formatBtn}
                disabled={reformatting}
                onClick={exitFraming}
              >
                ✕ Batal
              </button>
            </>
          )}
          {reformatting && <span className={editorStyles.formatHint}>Menyiapkan format baru...</span>}
        </div>

        <div
          className={editorStyles.videoWrapper}
          style={{ aspectRatio: framingMode && sourceAR ? `${sourceAR} ` : previewAspect }}
        >
          <video
            ref={videoRef}
            src={framingMode ? (activeClip.sourceVideoPath || activeClip.videoPath) : activeClip.videoPath}
            controls={!framingMode}
            className={editorStyles.video}
            key={`${framingMode}:${activeClip.videoPath}`}
            onLoadedMetadata={(e) => {
              if (framingMode && e.currentTarget.videoWidth > 0) {
                setSourceAR(e.currentTarget.videoWidth / e.currentTarget.videoHeight);
              }
            }}
          />
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
            </div>
          )}
          {/* Dynamic B-Roll Visual Overlay */}
          {!framingMode && (
            <BrollOverlay
              key={`broll-${activeClip.id || activeClipIdx}`}
              videoRef={videoRef}
              brollSettings={activeBroll}
            />
          )}
          {/* Subtitle Overlay */}
          {!framingMode && (
            <SubtitleOverlay
              key={`sub-${activeClip.id || activeClip.videoPath}-${activeClipIdx}`}
              videoRef={videoRef}
              segments={activeClip.segments}
              style={activeStyle}
            />
          )}
          {/* Watermark live preview (branding) */}
          {activeWatermark?.enabled && !framingMode && (
            activeWatermark.type === 'image' && activeWatermark.imagePath ? (
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

        {/* Crop keyframe timeline (animated pan) */}
        {framingMode && keyframes && (
          <div className={editorStyles.kfTimelineBar}>
            <span className={editorStyles.kfTimelineLabel}>Crop Timeline</span>
            <div
              ref={kfTimelineRef}
              className={editorStyles.kfTimelineTrack}
              onPointerDown={kfTimelineDown}
              onPointerUp={kfTimelineUp}
            >
              {keyframes.map((kf) => (
                <div
                  key={kf._id}
                  className={`${editorStyles.kfDot} ${kf._id === activeKfId ? editorStyles.kfDotActive : ''}`}
                  style={{ left: `${(Math.max(0, Math.min(clipDur, kf.t)) / clipDur) * 100}%` }}
                  title={`t=${kf.t.toFixed(1)}s`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    kfSelectById(kf._id);
                    kfDotDragRef.current = { id: kf._id, startX: e.clientX, startT: kf.t, rect: kfTimelineRef.current.getBoundingClientRect() };
                  }}
                  onPointerMove={(e) => {
                    const d = kfDotDragRef.current;
                    if (!d || d.id !== kf._id) return;
                    const dt = ((e.clientX - d.startX) / d.rect.width) * clipDur;
                    kfMoveTimeById(kf._id, d.startT + dt);
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    kfDotDragRef.current = null;
                    kfSortById();
                  }}
                />
              ))}
            </div>
            <span className={editorStyles.kfHint}>
              klik garis = tambah keyframe · drag kotak = posisi kf aktif · drag titik = waktu
            </span>
            <button
              type="button"
              className={editorStyles.formatBtn}
              onClick={() => kfRemoveById(activeKfId)}
              disabled={reformatting || keyframes.length <= 1}
            >
              Hapus
            </button>
          </div>
        )}
      </div>

      <div className={editorStyles.controlsSection}>
        <div className={editorStyles.controlsHeader}>
          <h3 className={editorStyles.controlsTitle}>Production Studio</h3>
          <span className={editorStyles.controlsBadge}>Clip {activeClipIdx + 1}</span>
        </div>

        {/* ── 0. AI Virality Score & Hook Analyzer Card ── */}
        <div className={`${editorStyles.viralityCard} ${viralityScore.score >= 80 ? editorStyles.viralityCardActive : ''}`}>
          <div className={editorStyles.viralityHeader}>
            <div className={editorStyles.viralityTitle}>
              <span>📊 AI Virality & Hook Analyzer</span>
            </div>
            <span
              className={editorStyles.viralityBadgePill}
              style={{
                backgroundColor: viralityScore.color ? `${viralityScore.color}22` : 'rgba(16, 185, 129, 0.15)',
                color: viralityScore.color || '#10b981',
                borderColor: viralityScore.borderColor || 'rgba(16, 185, 129, 0.3)',
              }}
            >
              <span>{viralityScore.badgeEmoji}</span>
              <span>{viralityScore.gradeLabel}</span>
            </span>
          </div>

          {/* Prominent Radial/Circular Score Hero Meter */}
          <div className={editorStyles.viralityScoreHero}>
            <div
              className={editorStyles.viralityGaugeWrap}
              style={{
                background: `conic-gradient(${viralityScore.color || '#10b981'} ${viralityScore.score * 3.6}deg, var(--bg-subtle) 0deg)`,
              }}
            >
              <div className={editorStyles.viralityGaugeInner}>
                <span className={editorStyles.viralityScoreValue} style={{ color: viralityScore.color || '#10b981' }}>
                  {viralityScore.score}
                </span>
                <span className={editorStyles.viralityScoreMax}>/ 100</span>
              </div>
            </div>

            <div className={editorStyles.viralityHeroInfo}>
              <span
                className={editorStyles.viralityBadgePill}
                style={{
                  backgroundColor: viralityScore.color ? `${viralityScore.color}15` : 'rgba(16, 185, 129, 0.12)',
                  color: viralityScore.color || '#10b981',
                  borderColor: viralityScore.borderColor || 'rgba(16, 185, 129, 0.25)',
                }}
              >
                <span>{viralityScore.badgeEmoji}</span>
                <span>{viralityScore.badge}</span>
              </span>
              <p className={editorStyles.viralitySummary}>{viralityScore.summary}</p>
            </div>
          </div>

          {/* Editable Hook Input with Realtime Recalculation */}
          <div className={editorStyles.hookEditorBox}>
            <div className={editorStyles.hookEditorLabelRow}>
              <label className={editorStyles.hookEditorLabel}>Opening Hook (First 3s)</label>
              <span className={editorStyles.hookWordCount}>
                {viralityScore.breakdown?.hookStrength?.wordCount || 0} kata ({viralityScore.breakdown?.hookStrength?.brevityLabel || 'Optimal'})
              </span>
            </div>
            <textarea
              className={editorStyles.hookTextarea}
              value={activeClip.hook || ''}
              onChange={(e) => handleUpdateHook(e.target.value)}
              placeholder="Tulis hook kalimat pembuka 3 detik pertama..."
              rows={2}
            />
          </div>

          {/* Sub-Score Breakdown Bars */}
          <div className={editorStyles.breakdownSection}>
            {/* 1. Hook Strength */}
            <div className={editorStyles.breakdownItem}>
              <div className={editorStyles.breakdownItemTop}>
                <span className={editorStyles.breakdownItemTitle}>
                  <span>🎯 Hook Strength</span>
                  <span className={editorStyles.breakdownItemWeight}>40%</span>
                </span>
                <span className={editorStyles.breakdownScoreVal} style={{ color: viralityScore.breakdown?.hookStrength?.score >= 80 ? '#10b981' : viralityScore.breakdown?.hookStrength?.score >= 65 ? '#f59e0b' : '#ef4444' }}>
                  {viralityScore.breakdown?.hookStrength?.score || 0}/100
                </span>
              </div>
              <div className={editorStyles.breakdownProgressTrack}>
                <div
                  className={editorStyles.breakdownProgressBar}
                  style={{
                    width: `${viralityScore.breakdown?.hookStrength?.score || 0}%`,
                    backgroundColor: viralityScore.breakdown?.hookStrength?.score >= 80 ? '#10b981' : viralityScore.breakdown?.hookStrength?.score >= 65 ? '#f59e0b' : '#ef4444',
                  }}
                />
              </div>
              <div className={editorStyles.breakdownMeta}>
                <span className={`${editorStyles.breakdownChip} ${viralityScore.breakdown?.hookStrength?.hasQuestion ? editorStyles.breakdownChipActive : ''}`}>
                  {viralityScore.breakdown?.hookStrength?.hasQuestion ? '✓ Question Hook' : '○ Question'}
                </span>
                <span className={`${editorStyles.breakdownChip} ${viralityScore.breakdown?.hookStrength?.hasDirectAddress ? editorStyles.breakdownChipActive : ''}`}>
                  {viralityScore.breakdown?.hookStrength?.hasDirectAddress ? '✓ Direct Address (Kamu)' : '○ Direct Address'}
                </span>
                <span className={`${editorStyles.breakdownChip} ${viralityScore.breakdown?.hookStrength?.hasPowerWords ? editorStyles.breakdownChipActive : ''}`}>
                  {viralityScore.breakdown?.hookStrength?.hasPowerWords ? `✓ Power Words (${viralityScore.breakdown?.hookStrength?.powerWordsFound?.length || 1})` : '○ Power Words'}
                </span>
                <span className={`${editorStyles.breakdownChip} ${viralityScore.breakdown?.hookStrength?.hasNumbers ? editorStyles.breakdownChipActive : ''}`}>
                  {viralityScore.breakdown?.hookStrength?.hasNumbers ? '✓ Numbers/Data' : '○ Numbers'}
                </span>
              </div>
            </div>

            {/* 2. Speech Pacing / WPM */}
            <div className={editorStyles.breakdownItem}>
              <div className={editorStyles.breakdownItemTop}>
                <span className={editorStyles.breakdownItemTitle}>
                  <span>⚡ Speech Pacing</span>
                  <span className={editorStyles.breakdownItemWeight}>30%</span>
                </span>
                <span className={editorStyles.breakdownScoreVal} style={{ color: viralityScore.breakdown?.speechPacing?.score >= 80 ? '#3b82f6' : viralityScore.breakdown?.speechPacing?.score >= 65 ? '#f59e0b' : '#ef4444' }}>
                  {viralityScore.breakdown?.speechPacing?.wpm || 0} WPM ({viralityScore.breakdown?.speechPacing?.score || 0}/100)
                </span>
              </div>
              <div className={editorStyles.breakdownProgressTrack}>
                <div
                  className={editorStyles.breakdownProgressBar}
                  style={{
                    width: `${viralityScore.breakdown?.speechPacing?.score || 0}%`,
                    backgroundColor: viralityScore.breakdown?.speechPacing?.score >= 80 ? '#3b82f6' : viralityScore.breakdown?.speechPacing?.score >= 65 ? '#f59e0b' : '#ef4444',
                  }}
                />
              </div>
              <div className={editorStyles.breakdownMeta}>
                <span className={`${editorStyles.breakdownChip} ${editorStyles.breakdownChipActive}`}>
                  {viralityScore.breakdown?.speechPacing?.tempoStatus || 'Optimal Tempo'}
                </span>
                <span className={editorStyles.breakdownChip}>
                  Target: 135–170 WPM
                </span>
                {viralityScore.breakdown?.speechPacing?.pauseCount > 0 && (
                  <span className={editorStyles.breakdownChip} style={{ color: '#f59e0b' }}>
                    ⚠️ {viralityScore.breakdown?.speechPacing?.pauseCount} pause gap
                  </span>
                )}
              </div>
            </div>

            {/* 3. Emotional Trigger */}
            <div className={editorStyles.breakdownItem}>
              <div className={editorStyles.breakdownItemTop}>
                <span className={editorStyles.breakdownItemTitle}>
                  <span>🔥 Emotional Trigger</span>
                  <span className={editorStyles.breakdownItemWeight}>30%</span>
                </span>
                <span className={editorStyles.breakdownScoreVal} style={{ color: viralityScore.breakdown?.emotionalTrigger?.score >= 80 ? '#ec4899' : viralityScore.breakdown?.emotionalTrigger?.score >= 65 ? '#f59e0b' : '#ef4444' }}>
                  {viralityScore.breakdown?.emotionalTrigger?.score || 0}/100
                </span>
              </div>
              <div className={editorStyles.breakdownProgressTrack}>
                <div
                  className={editorStyles.breakdownProgressBar}
                  style={{
                    width: `${viralityScore.breakdown?.emotionalTrigger?.score || 0}%`,
                    backgroundColor: viralityScore.breakdown?.emotionalTrigger?.score >= 80 ? '#ec4899' : viralityScore.breakdown?.emotionalTrigger?.score >= 65 ? '#f59e0b' : '#ef4444',
                  }}
                />
              </div>
              <div className={editorStyles.breakdownMeta}>
                <span className={`${editorStyles.breakdownChip} ${editorStyles.breakdownChipActive}`}>
                  {viralityScore.breakdown?.emotionalTrigger?.dominantEmotionEmoji || '🔍'} {viralityScore.breakdown?.emotionalTrigger?.dominantEmotion || 'Curiosity & Mystery'}
                </span>
                {Array.isArray(viralityScore.breakdown?.emotionalTrigger?.emotionalKeywords) &&
                  viralityScore.breakdown?.emotionalTrigger?.emotionalKeywords.map((kw, i) => (
                    <span key={i} className={editorStyles.breakdownChip}>
                      #{kw}
                    </span>
                  ))}
              </div>
            </div>
          </div>

          {/* Actionable Optimization Tips */}
          {Array.isArray(viralityScore.tips) && viralityScore.tips.length > 0 && (
            <div className={editorStyles.tipsCard}>
              <div className={editorStyles.tipsHeader}>
                <span>💡 Actionable Optimization Tips</span>
              </div>
              <ul className={editorStyles.tipsList}>
                {viralityScore.tips.map((tip, idx) => (
                  <li key={idx} className={editorStyles.tipItem}>
                    <span className={editorStyles.tipBullet}>•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* AI Alternative Viral Hooks with 1-Click Apply */}
          {Array.isArray(viralityScore.alternativeHooks) && viralityScore.alternativeHooks.length > 0 && (
            <div className={editorStyles.suggestionsBox}>
              <div className={editorStyles.suggestionsHeader}>
                <span className={editorStyles.suggestionsTitle}>
                  <span>✨ AI Hook Suggestions</span>
                </span>
              </div>
              {viralityScore.alternativeHooks.map((alt) => (
                <div key={alt.id || alt.hook} className={editorStyles.suggestionItem}>
                  <div className={editorStyles.suggestionTop}>
                    <span className={editorStyles.suggestionStyleName}>{alt.style}</span>
                    <span className={editorStyles.suggestionBadge}>{alt.badge}</span>
                  </div>
                  <div className={editorStyles.suggestionText}>&ldquo;{alt.hook}&rdquo;</div>
                  <button
                    type="button"
                    className={editorStyles.applyHookBtn}
                    onClick={() => handleUpdateHook(alt.hook)}
                    title="Terapkan hook ini ke klip aktif"
                  >
                    <span>⚡ Apply Hook</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 1. OpenCV AI Tracking Toggles ── */}
        <div className={`${editorStyles.faceTrackingBox} ${activeClip.faceTracking ? editorStyles.faceTrackingBoxActive : ''}`}>
          <div className={editorStyles.faceTrackingHeader}>
            <span className={editorStyles.faceTrackingTitle}>
              <span>Face Tracking</span>
              <span className={editorStyles.faceTrackingBadge}>OpenCV</span>
            </span>
            <label className={editorStyles.switchLabel}>
              <input
                type="checkbox"
                checked={Boolean(activeClip.faceTracking)}
                disabled={trackingLoading || lipTrackingLoading || splitScreenLoading}
                onChange={(e) => handleToggleFaceTracking(e.target.checked)}
                className={editorStyles.switchInput}
              />
              <span className={editorStyles.switchSlider}></span>
            </label>
          </div>
          <p className={editorStyles.faceTrackingDesc}>
            Otomatis memposisikan framing vertikal 9:16 mengikuti pergerakan wajah pembicara.
          </p>
          {trackingLoading && (
            <div className={editorStyles.faceTrackingLoading}>
              <div className={editorStyles.spinnerSmall}></div>
              <span>Melacak wajah dengan OpenCV...</span>
            </div>
          )}
        </div>

        <div className={`${editorStyles.faceTrackingBox} ${activeClip.lipTracking ? editorStyles.faceTrackingBoxActive : ''}`}>
          <div className={editorStyles.faceTrackingHeader}>
            <span className={editorStyles.faceTrackingTitle}>
              <span>Lip Tracking</span>
              <span className={editorStyles.faceTrackingBadge} style={{ background: 'rgba(236, 72, 153, 0.15)', color: '#ec4899', borderColor: 'rgba(236, 72, 153, 0.3)' }}>Active Speaker</span>
            </span>
            <label className={editorStyles.switchLabel}>
              <input
                type="checkbox"
                checked={Boolean(activeClip.lipTracking)}
                disabled={lipTrackingLoading || trackingLoading || splitScreenLoading}
                onChange={(e) => handleToggleLipTracking(e.target.checked)}
                className={editorStyles.switchInput}
              />
              <span className={editorStyles.switchSlider}></span>
            </label>
          </div>
          <p className={editorStyles.faceTrackingDesc}>
            Mendeteksi gerakan bibir untuk otomatis mengarahkan kamera ke orang yang sedang aktif berbicara.
          </p>
          {lipTrackingLoading && (
            <div className={editorStyles.faceTrackingLoading}>
              <div className={editorStyles.spinnerSmall}></div>
              <span>Melacak gerakan bibir dengan OpenCV...</span>
            </div>
          )}
        </div>

        <div className={`${editorStyles.faceTrackingBox} ${activeClip.splitScreen ? editorStyles.faceTrackingBoxActive : ''}`}>
          <div className={editorStyles.faceTrackingHeader}>
            <span className={editorStyles.faceTrackingTitle}>
              <span>Split Screen</span>
              <span className={editorStyles.faceTrackingBadge} style={{ background: 'rgba(99, 102, 241, 0.18)', color: '#6366f1', borderColor: 'rgba(99, 102, 241, 0.3)' }}>Podcast 2-P</span>
            </span>
            <label className={editorStyles.switchLabel}>
              <input
                type="checkbox"
                checked={Boolean(activeClip.splitScreen)}
                disabled={splitScreenLoading || trackingLoading || lipTrackingLoading}
                onChange={(e) => handleToggleSplitScreen(e.target.checked)}
                className={editorStyles.switchInput}
              />
              <span className={editorStyles.switchSlider}></span>
            </label>
          </div>
          <p className={editorStyles.faceTrackingDesc}>
            Layout vertikal 9:16 bertumpuk otomatis melacak 2 pembicara podcast.
          </p>
          {splitScreenLoading && (
            <div className={editorStyles.faceTrackingLoading}>
              <div className={editorStyles.spinnerSmall}></div>
              <span>Memproses split screen podcast...</span>
            </div>
          )}
        </div>

        {/* ── 2. Auto B-Roll Visual Controls ── */}
        <div className={`${editorStyles.brollBox} ${activeBroll.enabled ? editorStyles.brollBoxActive : ''}`}>
          <div className={editorStyles.faceTrackingHeader}>
            <span className={editorStyles.faceTrackingTitle}>
              <span>Auto B-Roll Overlay</span>
              <span className={editorStyles.faceTrackingBadge} style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.3)' }}>Visual AI</span>
            </span>
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
          <p className={editorStyles.faceTrackingDesc}>
            Menampilkan overlay visual kontekstual otomatis berdasarkan kata kunci Whisper transcript.
          </p>

          {activeBroll.enabled && (
            <>
              <div className={editorStyles.controlGroup}>
                <label className={editorStyles.controlLabel}>B-Roll Theme Preset</label>
                <select
                  value={activeBroll.theme || 'auto'}
                  onChange={(e) => handleBrollThemeChange(e.target.value)}
                  className={editorStyles.input}
                >
                  <option value="auto">⚡ Auto (Smart Transcript Match)</option>
                  {BROLL_THEMES.map((th) => (
                    <option key={th.id} value={th.id}>
                      {th.icon} {th.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={editorStyles.controlGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className={editorStyles.controlLabel}>
                    Active Overlays ({activeBroll.overlays?.length || 0})
                  </label>
                  <button
                    type="button"
                    onClick={handleAddBrollAtCurrentTime}
                    className={editorStyles.addBrollBtn}
                    title="Tambahkan B-Roll di posisi waktu playhead saat ini"
                  >
                    + Add at Current Time
                  </button>
                </div>

                <div className={editorStyles.brollTimelineList}>
                  {(!activeBroll.overlays || activeBroll.overlays.length === 0) && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-sub)' }}>
                      Belum ada B-Roll untuk klip ini.
                    </span>
                  )}
                  {(activeBroll.overlays || []).map((o) => (
                    <div key={o.id} className={editorStyles.brollChip}>
                      <div className={editorStyles.brollChipLeft}>
                        <span>{o.icon || '🎬'}</span>
                        <span className={editorStyles.brollChipTime}>
                          {o.start}s - {o.end}s
                        </span>
                        <span className={editorStyles.brollChipLabel}>
                          {o.keyword ? `"${o.keyword}"` : o.themeName}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveBrollOverlay(o.id)}
                        className={editorStyles.brollChipRemove}
                        title="Hapus overlay ini"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── 3. Audio & Auto Ducking Controls ── */}
        <div className={`${editorStyles.audioSectionBox} ${activeAudio.bgmTrack !== 'none' ? editorStyles.audioSectionBoxActive : ''}`}>
          <div className={editorStyles.faceTrackingHeader}>
            <span className={editorStyles.faceTrackingTitle}>
              <span>Audio & BGM Ducking</span>
              <span className={editorStyles.faceTrackingBadge} style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)' }}>Broadcast</span>
            </span>
          </div>
          <p className={editorStyles.faceTrackingDesc}>
            Musik latar otomatis turun saat ada suara vokal dan naik saat jeda hening.
          </p>

          <div className={editorStyles.controlGroup}>
            <label className={editorStyles.controlLabel}>Background Music Track</label>
            <div className={editorStyles.bgmPickerRow}>
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
                  onClick={() => handleTogglePreviewTrack(activeAudio.bgmTrack)}
                  className={`${editorStyles.previewBgmBtn} ${
                    previewingTrackId === activeAudio.bgmTrack ? editorStyles.previewBgmBtnActive : ''
                  }`}
                  title="Dengarkan preview musik"
                >
                  {previewingTrackId === activeAudio.bgmTrack ? '⏹ Stop' : '▶ Sample'}
                </button>
              )}
            </div>
          </div>

          {activeAudio.bgmTrack !== 'none' && (
            <>
              <div className={editorStyles.controlGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <label className={editorStyles.controlLabel}>BGM Master Volume</label>
                  <span className={editorStyles.volumeBadge}>{Math.round(activeAudio.bgmVolume * 100)}%</span>
                </div>
                <div className={editorStyles.volumeSliderWrap}>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={activeAudio.bgmVolume}
                    onChange={(e) => updateAudioSetting('bgmVolume', parseFloat(e.target.value))}
                    className={editorStyles.volumeSlider}
                  />
                </div>
              </div>

              <div className={editorStyles.faceTrackingHeader}>
                <span className={editorStyles.faceTrackingTitle} style={{ fontSize: '0.78rem' }}>
                  <span>Auto Audio Ducking</span>
                </span>
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

              {activeAudio.duckingEnabled && (
                <div className={editorStyles.controlGroup}>
                  <label className={editorStyles.controlLabel}>Ducking Intensity</label>
                  <div className={editorStyles.duckingOptionsGrid}>
                    <button
                      type="button"
                      className={`${editorStyles.duckingOptionBtn} ${
                        activeAudio.duckingStrength === 'light' ? editorStyles.duckingOptionBtnActive : ''
                      }`}
                      onClick={() => updateAudioSetting('duckingStrength', 'light')}
                    >
                      Light (35%)
                    </button>
                    <button
                      type="button"
                      className={`${editorStyles.duckingOptionBtn} ${
                        activeAudio.duckingStrength === 'medium' ? editorStyles.duckingOptionBtnActive : ''
                      }`}
                      onClick={() => updateAudioSetting('duckingStrength', 'medium')}
                    >
                      Medium (65%)
                    </button>
                    <button
                      type="button"
                      className={`${editorStyles.duckingOptionBtn} ${
                        activeAudio.duckingStrength === 'heavy' ? editorStyles.duckingOptionBtnActive : ''
                      }`}
                      onClick={() => updateAudioSetting('duckingStrength', 'heavy')}
                    >
                      Heavy (85%)
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <div className={editorStyles.faceTrackingHeader} style={{ paddingTop: '4px' }}>
            <span className={editorStyles.faceTrackingTitle} style={{ fontSize: '0.78rem' }}>
              <span>Sound Effects (SFX)</span>
            </span>
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
            <div className={editorStyles.controlGroup}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <label className={editorStyles.controlLabel}>SFX Volume</label>
                <span className={editorStyles.volumeBadge}>{Math.round(activeAudio.sfxVolume * 100)}%</span>
              </div>
              <div className={editorStyles.volumeSliderWrap}>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={activeAudio.sfxVolume}
                  onChange={(e) => updateAudioSetting('sfxVolume', parseFloat(e.target.value))}
                  className={editorStyles.volumeSlider}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── 4. Subtitle Typography & Styles ── */}
        <div className={editorStyles.controlGroup}>
          <div className={editorStyles.presetRowHeader}>
            <label className={editorStyles.controlLabel}>Preset Gaya Caption</label>
            <button
              type="button"
              className={editorStyles.presetApplyAllBtn}
              onClick={applyActiveStyleToAll}
              title="Salin gaya klip aktif ke semua klip"
            >
              Terapkan ke semua klip
            </button>
          </div>
          <div className={editorStyles.presetChipRow}>
            {CAPTION_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={editorStyles.presetChip}
                title={`${preset.desc} — ${preset.style.font}, ${preset.style.size}, ${preset.style.animation}`}
                onClick={() => applyCaptionStyle(preset.style)}
              >
                <span>{preset.emoji}</span>
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={editorStyles.controlGroup}>
          <label className={editorStyles.controlLabel}>Font Family</label>
          <select
            value={activeStyle.font}
            onChange={(e) => updateStyle('font', e.target.value)}
            className={editorStyles.input}
          >
            <option>Impact</option>
            <option>Inter</option>
            <option>Roboto</option>
            <option>Montserrat</option>
            <option>Bangers</option>
          </select>
        </div>

        <div className={editorStyles.controlGroup}>
          <label className={editorStyles.controlLabel}>Font Size</label>
          <select
            value={activeStyle.size}
            onChange={(e) => updateStyle('size', e.target.value)}
            className={editorStyles.input}
          >
            <option>Small</option>
            <option>Medium</option>
            <option>Large</option>
          </select>
        </div>

        <div className={editorStyles.controlGroup}>
          <label className={editorStyles.controlLabel}>Text Color</label>
          <div className={editorStyles.colorWrap}>
            <input
              type="color"
              value={activeStyle.color}
              onChange={(e) => updateStyle('color', e.target.value)}
              className={editorStyles.colorInput}
            />
            <span className={editorStyles.colorHex}>{activeStyle.color.toUpperCase()}</span>
          </div>
        </div>

        <div className={editorStyles.togglesRow}>
          <label className={editorStyles.checkboxLabel}>
            <input
              type="checkbox"
              checked={activeStyle.outline}
              onChange={(e) => updateStyle('outline', e.target.checked)}
              className={editorStyles.checkbox}
            />
            <span>Text Outline</span>
          </label>

          <label className={editorStyles.checkboxLabel}>
            <input
              type="checkbox"
              checked={activeStyle.shadow}
              onChange={(e) => updateStyle('shadow', e.target.checked)}
              className={editorStyles.checkbox}
            />
            <span>Drop Shadow</span>
          </label>
        </div>

        <div className={editorStyles.controlGroup}>
          <label className={editorStyles.controlLabel}>Animation Style</label>
          <select
            value={activeStyle.animation}
            onChange={(e) => updateStyle('animation', e.target.value)}
            className={editorStyles.input}
          >
            <option>None</option>
            <option>Karaoke</option>
            <option>Pop</option>
            <option>Slide Up</option>
            <option>Blur</option>
            <option>Bounce</option>
          </select>
        </div>

        {/* ── 5. Social Media Copy Panel ── */}
        <div className={editorStyles.socialCopyCard}>
          <div className={editorStyles.socialHeader}>
            <span className={editorStyles.socialTitle}>
              <span>Social Media Copy</span>
              <span className={editorStyles.socialBadge}>AI</span>
            </span>
            {copyStatus && <span className={editorStyles.copyFeedback}>✓ {copyStatus}</span>}
          </div>

          <div className={editorStyles.metaInfoRow}>
            {activeClip.channelName && (
              <span className={editorStyles.metaPill}>
                <span>👤</span>
                <span className={editorStyles.metaPillHighlight}>@{activeClip.channelName}</span>
              </span>
            )}
            {(activeClip.startTime || activeClip.start_time) && (
              <span className={editorStyles.metaPill}>
                <span>⏱️</span>
                <span>{activeClip.startTime || activeClip.start_time} - {activeClip.endTime || activeClip.end_time}</span>
              </span>
            )}
            {activeClip.duration && (
              <span className={editorStyles.metaPill}>
                <span>⏳</span>
                <span>{activeClip.duration}s</span>
              </span>
            )}
          </div>

          {activeClip.hook && (
            <div className={editorStyles.socialHookBox}>
              <span className={editorStyles.hookLabel}>Viral Hook</span>
              <span className={editorStyles.hookText}>&ldquo;{activeClip.hook}&rdquo;</span>
            </div>
          )}

          {activeClip.caption && (
            <div className={editorStyles.socialCaptionText}>
              {activeClip.caption}
            </div>
          )}

          {Array.isArray(activeClip.hashtags) && activeClip.hashtags.length > 0 && (
            <div className={editorStyles.hashtagsWrap}>
              {activeClip.hashtags.map((tag, idx) => (
                <span key={idx} className={editorStyles.tagChip}>{tag}</span>
              ))}
            </div>
          )}

          <div className={editorStyles.platformCopyGrid}>
            <button
              type="button"
              className={editorStyles.platformBtn}
              onClick={() => handleCopyPlatform('youtube')}
              title="Copy formatted for YouTube Shorts"
            >
              <span className={editorStyles.platformIcon}>🔴</span>
              <span>YouTube</span>
            </button>
            <button
              type="button"
              className={editorStyles.platformBtn}
              onClick={() => handleCopyPlatform('instagram')}
              title="Copy formatted for Instagram Reels"
            >
              <span className={editorStyles.platformIcon}>📸</span>
              <span>Instagram</span>
            </button>
            <button
              type="button"
              className={editorStyles.platformBtn}
              onClick={() => handleCopyPlatform('tiktok')}
              title="Copy formatted for TikTok"
            >
              <span className={editorStyles.platformIcon}>🎵</span>
              <span>TikTok</span>
            </button>
          </div>
        </div>

        {/* ── Watermark (Branding) Card ── */}
        <div className={editorStyles.watermarkCard}>
          <div className={editorStyles.watermarkHeader}>
            <span className={editorStyles.watermarkTitle}>🏷️ Watermark (Branding)</span>
            <label className={editorStyles.switchLabel}>
              <input
                type="checkbox"
                checked={Boolean(activeWatermark?.enabled)}
                onChange={(e) => handleClipWatermark({ enabled: e.target.checked })}
              />
              <span className={editorStyles.switchSlider}></span>
              <span>Tampilkan</span>
            </label>
          </div>

          {activeWatermark?.enabled && (
            <>
              <div className={editorStyles.watermarkInputs}>
                <div className={editorStyles.controlGroup}>
                  <label className={editorStyles.controlLabel}>Teks / Handle</label>
                  <input
                    type="text"
                    className={editorStyles.input}
                    value={activeWatermark.text || ''}
                    onChange={(e) => handleClipWatermark({ type: activeWatermark.imagePath ? 'image' : 'text', text: e.target.value })}
                    placeholder="@channelmu"
                    maxLength={60}
                  />
                </div>

                <div className={editorStyles.controlGroup}>
                  <label className={editorStyles.controlLabel}>Logo (dipakai bila terisi)</label>
                  <input
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp"
                    onChange={handleClipLogoUpload}
                    disabled={wmUploading}
                  />
                  {activeWatermark.imagePath && (
                    <p style={{ fontSize: '0.68rem', color: 'var(--text-sub)', margin: 0 }}>✓ {activeWatermark.imagePath} <button type="button" style={{ cursor: 'pointer', marginLeft: 4 }} onClick={() => handleClipWatermark({ imagePath: '', type: 'text' })}>(hapus logo)</button></p>
                  )}
                </div>

                <div className={editorStyles.controlGroup}>
                  <label className={editorStyles.controlLabel}>Posisi</label>
                  <select
                    className={editorStyles.input}
                    value={activeWatermark.position || 'top-right'}
                    onChange={(e) => handleClipWatermark({ position: e.target.value })}
                  >
                    <option value="top-right">Kanan Atas</option>
                    <option value="top-left">Kiri Atas</option>
                    <option value="bottom-right">Kanan Bawah</option>
                    <option value="bottom-left">Kiri Bawah</option>
                  </select>
                </div>

                <div className={editorStyles.controlGroup}>
                  <label className={editorStyles.controlLabel}>Ukuran ({activeWatermark.sizePct}%)</label>
                  <input
                    type="range"
                    min={2}
                    max={15}
                    value={activeWatermark.sizePct ?? 6}
                    onChange={(e) => handleClipWatermark({ sizePct: Number(e.target.value) })}
                    style={{ width: '100%' }}
                  />
                </div>

                <div className={editorStyles.controlGroup}>
                  <label className={editorStyles.controlLabel}>Opacity ({Math.round((activeWatermark.opacity ?? 0.7) * 100)}%) — logo</label>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={Math.round((activeWatermark.opacity ?? 0.7) * 100)}
                    onChange={(e) => handleClipWatermark({ opacity: Number(e.target.value) / 100 })}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
              <p style={{ fontSize: '0.68rem', color: 'var(--text-sub)', margin: 0 }}>
                Preview tampil di atas video. Hasil render: logo pakai opacity di atas, teks selalu solid dengan outline.
              </p>
            </>
          )}
        </div>

        {onOpenPublish && (
          <button
            type="button"
            className={editorStyles.publishButton}
            onClick={() => {
              const currentClip = clips[activeClipIdx] || {};
              onOpenPublish({
                ...currentClip,
                style: activeStyle,
                audioSettings: activeAudio,
                brollSettings: activeBroll,
              });
            }}
          >
            <span>🚀 Direct Auto-Publish ke Medsos</span>
          </button>
        )}

        <button className={editorStyles.saveButton} onClick={handleSave}>
          Save to Library <span className={editorStyles.arrow}>→</span>
        </button>
      </div>
    </div>
  );
}

function EditorialContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

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

  // States: analyzing -> preparing -> editing -> rendering -> done
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
        if (!url && !localFilePath) {
          throw new Error('No video URL or uploaded file provided.');
        }

        // 1. Analyze
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

        // 2. Prepare Editor (Slice & Transcribe)
        const prepRes = await fetch('/api/prepare-editor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, localFilePath, clips, ratio, language }),
        });

        if (!prepRes.ok) {
          const prepErr = await prepRes.json().catch(() => ({}));
          throw new Error(prepErr.error || prepErr.details || 'Failed to prepare clips for editing');
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
    { id: 'analyzing', label: 'Analyzing Content', description: 'Transcribing speech & finding hooks' },
    { id: 'preparing', label: 'Preparing Editor', description: 'Extracting video & slicing segments' },
    { id: 'rendering', label: 'Rendering Clips', description: 'Burning styled subtitles & audio mixing' },
    { id: 'done', label: 'Ready', description: 'Saved to your personal library' },
  ];

  const effectiveStatus = status === 'error' ? 'analyzing' : status;
  const currentStepIndex = steps.findIndex((s) => s.id === effectiveStatus);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <AppLogo size={28} showText={false} href="/" />
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
          <div className={styles.headerTitle}>
            {status === 'editing' ? 'Realtime Subtitle & Production Studio' : 'Processing Content'}
          </div>
        </div>
        <div className={styles.headerRight}>
          <WebhookTriggerButton onClick={() => setIsWebhookModalOpen(true)} />
          <ThemeToggle />
          <Link href="/library" className={styles.libraryLink}>
            Library →
          </Link>
        </div>
      </header>

      {status === 'editing' ? (
        <main className={styles.editorMain}>
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
          />
        </main>
      ) : (
        <main className={styles.mainGrid}>
          <div className={styles.videoSection}>
            <div className={styles.videoWrapper}>
              {localFilePath ? (
                <video
                  className={styles.localVideoPlayer}
                  src={localFilePath}
                  controls
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              ) : videoId ? (
                <iframe
                  className={styles.iframe}
                  src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1`}
                  title="YouTube video player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className={styles.noVideo}>
                  <div className={styles.noVideoIcon}>🎬</div>
                  <p className={styles.noVideoTitle}>{fileName || url || 'Video Stream'}</p>
                  <p className={styles.noVideoSub}>Processing media stream & generating AI hooks...</p>
                </div>
              )}
            </div>
          </div>

          <aside className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <h2 className={styles.sidebarTitle}>Status Pipeline</h2>
              <span className={styles.ratioBadge}>{ratio}</span>
            </div>

            {status === 'error' ? (
              <div className={styles.errorCard}>
                <div className={styles.errorIcon}>!</div>
                <h3 className={styles.cardTitle}>Extraction Failed</h3>
                <p className={styles.cardDesc}>{errorMessage}</p>
                <Link href="/" className={styles.secondaryButton}>
                  ← Back to Home
                </Link>
              </div>
            ) : (
              <div className={styles.stepper}>
                {steps.map((step, index) => {
                  const isCompleted = currentStepIndex > index || status === 'done';
                  const isActive = status === step.id;

                  return (
        <div
                      key={step.id}
                      className={`${styles.step} ${isActive ? styles.stepActive : ''} ${
                        isCompleted ? styles.stepCompleted : ''
                      }`}
                    >
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
                <h3 className={styles.cardTitle}>Processing Complete</h3>
                <p className={styles.cardDesc}>All clips rendered and stored in your library.</p>
                <Link href="/library" className={styles.primaryButton}>
                  View in Library →
                </Link>
              </div>
            )}
          </aside>
        </main>
      )}

      {/* Webhook Automation Settings & Test Modal */}
      <WebhookModal
        isOpen={isWebhookModalOpen}
        onClose={() => setIsWebhookModalOpen(false)}
      />

      {/* Direct Auto-Publish Modal */}
      <DirectPublishModal
        isOpen={Boolean(publishModalClip)}
        clip={publishModalClip}
        onClose={() => setPublishModalClip(null)}
      />
    </div>
  );
}

export default function EditorialPage() {
  return (
    <Suspense fallback={<div className={styles.loadingPulse}>Loading editor...</div>}>
      <EditorialContent />
    </Suspense>
  );
}
