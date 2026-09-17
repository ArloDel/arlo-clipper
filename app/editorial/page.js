'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ThemeToggle from '@/app/components/ThemeToggle';
import WebhookModal, { WebhookTriggerButton } from '@/app/components/WebhookModal';
import DirectPublishModal, { DirectPublishTriggerButton } from '@/app/components/DirectPublishModal';
import { getYouTubeCopy, getInstagramCopy, getTikTokCopy } from '@/lib/socialCopy';
import { BGM_TRACKS } from '@/lib/audioCatalog';
import { BROLL_THEMES, detectAutoBroll } from '@/lib/brollCatalog';
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

function EditorStudio({ clips: initialClips, onSave, onOpenPublish, ratio }) {
  const [activeClipIdx, setActiveClipIdx] = useState(0);
  const [clips, setClips] = useState(initialClips);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [lipTrackingLoading, setLipTrackingLoading] = useState(false);
  const [splitScreenLoading, setSplitScreenLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  
  // Style settings per clip
  const [clipStyles, setClipStyles] = useState(
    initialClips.map(() => ({
      font: 'Impact',
      size: 'Medium',
      color: '#FFFF00',
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

  const videoRef = useRef(null);
  const bgmAudioRef = useRef(null);
  const previewAudioRef = useRef(null);
  const sfxAudioRef = useRef(null);
  const [previewingTrackId, setPreviewingTrackId] = useState(null);

  const activeClip = clips[activeClipIdx] || {};
  const activeStyle = clipStyles[activeClipIdx] || {};
  const activeAudio = clipAudioSettings[activeClipIdx] || {};
  const activeBroll = clipBrollSettings[activeClipIdx] || {};
  const isMobile = ratio === '9:16' || ratio === 'mobile';

  const updateStyle = (key, val) => {
    const newStyles = [...clipStyles];
    newStyles[activeClipIdx] = { ...newStyles[activeClipIdx], [key]: val };
    setClipStyles(newStyles);
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
              ratio,
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
              ratio,
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
              ratio,
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

        <div
          className={editorStyles.videoWrapper}
          style={{ aspectRatio: isMobile ? '9 / 16' : '16 / 9' }}
        >
          <video
            ref={videoRef}
            src={activeClip.videoPath}
            controls
            className={editorStyles.video}
            key={activeClip.videoPath}
          />
          {/* Dynamic B-Roll Visual Overlay */}
          <BrollOverlay
            key={`broll-${activeClip.id || activeClipIdx}`}
            videoRef={videoRef}
            brollSettings={activeBroll}
          />
          {/* Subtitle Overlay */}
          <SubtitleOverlay
            key={`sub-${activeClip.id || activeClip.videoPath}-${activeClipIdx}`}
            videoRef={videoRef}
            segments={activeClip.segments}
            style={activeStyle}
          />
        </div>
      </div>

      <div className={editorStyles.controlsSection}>
        <div className={editorStyles.controlsHeader}>
          <h3 className={editorStyles.controlsTitle}>Production Studio</h3>
          <span className={editorStyles.controlsBadge}>Clip {activeClipIdx + 1}</span>
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
  const ratio = searchParams.get('ratio') || '9:16';

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
        if (!url) throw new Error('No video URL provided.');

        // 1. Analyze
        const analyzeRes = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });

        if (!analyzeRes.ok) throw new Error('Failed to analyze video');
        const analyzeData = await analyzeRes.json();
        const clips = analyzeData.clips;
        if (!clips || clips.length === 0) throw new Error('No engaging clips found by the algorithm.');

        if (isMounted) setStatus('preparing');

        // 2. Prepare Editor (Slice & Transcribe)
        const prepRes = await fetch('/api/prepare-editor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, clips, ratio }),
        });

        if (!prepRes.ok) throw new Error('Failed to prepare clips for editing');
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
  }, [url, ratio]);

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
          />
        </main>
      ) : (
        <main className={styles.mainGrid}>
          <div className={styles.videoSection}>
            <div className={styles.videoWrapper}>
              {videoId ? (
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
                  <p>Processing media stream...</p>
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
