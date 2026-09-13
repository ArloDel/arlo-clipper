import fs from 'fs';
import path from 'path';

export { BGM_TRACKS, SFX_SOUNDS, DUCKING_PRESETS } from './audioCatalog.js';

/**
 * Creates a standard RIFF/WAVE PCM buffer
 * @param {Float32Array|number[]} samples Float samples from -1.0 to 1.0
 * @param {number} sampleRate Sample rate in Hz (default: 44100)
 * @param {number} numChannels Number of channels (1 = mono, 2 = stereo)
 * @returns {Buffer} Node.js Buffer containing complete WAV file
 */
export function createWavBuffer(samples, sampleRate = 44100, numChannels = 1) {
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // 1. RIFF Chunk Descriptor
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // 2. fmt Subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // BitsPerSample (16-bit)

  // 3. data Subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write PCM samples (16-bit signed integer)
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const intSample = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
    buffer.writeInt16LE(intSample, offset);
    offset += 2;
  }

  return buffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio Synthesizers for Royalty-Free SFX
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a crisp "pop" bubble sound
 */
export function synthesizePop(sampleRate = 44100) {
  const duration = 0.12;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Fast exponential pitch drop from 850Hz to 120Hz
    const freq = 120 + 730 * Math.exp(-t * 45);
    // Sharp attack & exponential decay envelope
    const env = Math.exp(-t * 38) * Math.sin(Math.min(1, t * 100) * (Math.PI / 2));
    const wave = Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(4 * Math.PI * freq * t);
    samples[i] = wave * env * 0.9;
  }
  return samples;
}

/**
 * Generate a fast airy "whoosh" sound
 */
export function synthesizeWhoosh(sampleRate = 44100) {
  const duration = 0.42;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = t / duration;
    // Bell curve amplitude envelope
    const env = Math.sin(progress * Math.PI) ** 2;
    // White noise modulated with moving bandpass filter
    const noise = (Math.random() * 2 - 1);
    const centerFreq = 300 + 1800 * Math.sin(progress * Math.PI);
    const tone = Math.sin(2 * Math.PI * centerFreq * t);
    samples[i] = (noise * 0.7 + tone * 0.3) * env * 0.85;
  }
  return samples;
}

/**
 * Generate a smooth dynamic "swoosh" sound
 */
export function synthesizeSwoosh(sampleRate = 44100) {
  const duration = 0.36;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = t / duration;
    const env = Math.sin(progress * Math.PI) ** 1.8;
    const freq = 450 + 900 * Math.sin(progress * Math.PI);
    const noise = (Math.random() * 2 - 1) * 0.4;
    const tone = Math.sin(2 * Math.PI * freq * t);
    samples[i] = (tone + noise) * env * 0.8;
  }
  return samples;
}

/**
 * Generate a bright chime "ding" sound
 */
export function synthesizeDing(sampleRate = 44100) {
  const duration = 0.85;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const f0 = 2093; // C7
    const f1 = 4186; // C8 harmonic
    const f2 = 5274; // E8 harmonic
    const env0 = Math.exp(-t * 5.5);
    const env1 = Math.exp(-t * 8.0);
    const env2 = Math.exp(-t * 12.0);

    const wave =
      0.6 * Math.sin(2 * Math.PI * f0 * t) * env0 +
      0.3 * Math.sin(2 * Math.PI * f1 * t) * env1 +
      0.15 * Math.sin(2 * Math.PI * f2 * t) * env2;

    samples[i] = wave * 0.9;
  }
  return samples;
}

/**
 * Generate a punchy low sub-bass "impact" sound
 */
export function synthesizeImpact(sampleRate = 44100) {
  const duration = 0.75;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Pitch drops from 120Hz down to 38Hz
    const freq = 38 + 82 * Math.exp(-t * 14);
    const subEnv = Math.exp(-t * 4.5);
    const clickEnv = Math.exp(-t * 80);
    const click = (Math.random() * 2 - 1) * clickEnv * 0.6;
    const sub = Math.sin(2 * Math.PI * freq * t) * subEnv * 0.9;
    samples[i] = (sub + click);
  }
  return samples;
}

/**
 * Generate a camera mechanical shutter sound
 */
export function synthesizeCameraShutter(sampleRate = 44100) {
  const duration = 0.32;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Click 1 at t=0, Click 2 at t=0.08s
    const t1 = t;
    const t2 = t - 0.08;
    const click1 = t1 >= 0 ? Math.exp(-t1 * 120) * (Math.random() * 2 - 1) : 0;
    const click2 = t2 >= 0 ? Math.exp(-t2 * 90) * (Math.random() * 2 - 1) * 1.2 : 0;
    const motor = t > 0.12 ? Math.exp(-(t - 0.12) * 20) * Math.sin(2 * Math.PI * 400 * t) * 0.2 : 0;
    samples[i] = (click1 * 0.7 + click2 * 0.8 + motor) * 0.85;
  }
  return samples;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio Synthesizers for Royalty-Free BGM Loops (Seamless Musical Loops)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upbeat & Energetic BGM (128 BPM, 16s loop, 4-on-the-floor, synth bass, bright arps)
 */
export function synthesizeUpbeatBGM(sampleRate = 44100) {
  const bpm = 128;
  const beatSec = 60 / bpm;
  const loopBars = 8;
  const totalBeats = loopBars * 4; // 32 beats = 15.0 sec
  const duration = totalBeats * beatSec;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  // Chords: Am -> F -> C -> G (2 bars each)
  const rootNotes = [110, 87.31, 130.81, 98]; // A2, F2, C3, G2
  const arpNotes = [
    [440, 523.25, 659.25, 880], // A minor
    [349.23, 440, 523.25, 698.46], // F Major
    [261.63, 329.63, 392.0, 523.25], // C Major
    [392.0, 493.88, 587.33, 783.99], // G Major
  ];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const currentBeat = (t / beatSec) % totalBeats;
    const bar = Math.floor(currentBeat / 4);
    const chordIdx = Math.floor(bar / 2) % 4;

    // 1. Kick Drum on every beat
    const beatPhase = (t % beatSec) / beatSec;
    const kickEnv = Math.exp(-beatPhase * 18);
    const kickFreq = 48 + 110 * Math.exp(-beatPhase * 35);
    const kick = Math.sin(2 * Math.PI * kickFreq * t) * kickEnv * 0.65;

    // 2. Offbeat Hi-Hat (on half beats)
    const hatPhase = ((t + beatSec * 0.5) % beatSec) / beatSec;
    const hatEnv = Math.exp(-hatPhase * 30);
    const hat = (Math.random() * 2 - 1) * hatEnv * 0.15;

    // 3. Synth Bass (16th notes groove)
    const sixteenthPhase = (t % (beatSec / 4)) / (beatSec / 4);
    const bassEnv = Math.exp(-sixteenthPhase * 9);
    const bassFreq = rootNotes[chordIdx];
    const bass = (Math.sin(2 * Math.PI * bassFreq * t) + 0.3 * Math.sin(4 * Math.PI * bassFreq * t)) * bassEnv * 0.28;

    // 4. Arpeggiator (16th notes melody)
    const arpStep = Math.floor(t / (beatSec / 4)) % 4;
    const arpFreq = arpNotes[chordIdx][arpStep];
    const arpPhase = (t % (beatSec / 4)) / (beatSec / 4);
    const arpEnv = Math.exp(-arpPhase * 8);
    const arp = Math.sin(2 * Math.PI * arpFreq * t) * arpEnv * 0.18;

    samples[i] = (kick + hat + bass + arp) * 0.8;
  }

  return samples;
}

/**
 * Chill & Lofi Vibes (80 BPM, 16s loop, warm jazz chords, gentle snare, vinyl dust)
 */
export function synthesizeChillLofiBGM(sampleRate = 44100) {
  const bpm = 80;
  const beatSec = 60 / bpm;
  const loopBars = 4;
  const totalBeats = loopBars * 4; // 16 beats = 12.0 sec
  const duration = totalBeats * beatSec;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  // Lofi progression: Cmaj7 -> Am7 -> Dm7 -> G7
  const chordFrequencies = [
    [261.63, 329.63, 392.0, 493.88], // Cmaj7
    [220.0, 261.63, 329.63, 392.0],  // Am7
    [146.83, 174.61, 220.0, 261.63], // Dm7
    [196.0, 246.94, 293.66, 349.23], // G7
  ];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const currentBeat = (t / beatSec) % totalBeats;
    const bar = Math.floor(currentBeat / 4) % 4;

    // 1. Vinyl Crackle / Soft White Noise
    const vinyl = (Math.random() * 2 - 1) * 0.025;

    // 2. Warm Electric Piano Chords (Gentle tremolo)
    const chord = chordFrequencies[bar];
    const tremolo = 1 + 0.15 * Math.sin(2 * Math.PI * 3.5 * t);
    let epiano = 0;
    for (const f of chord) {
      epiano += (Math.sin(2 * Math.PI * f * t) + 0.2 * Math.sin(4 * Math.PI * f * t));
    }
    epiano = (epiano / chord.length) * tremolo * 0.22;

    // 3. Relaxed Kick (on beat 1 and 3.5)
    const beatPos = currentBeat % 4;
    let kick = 0;
    if (beatPos < 0.8 || (beatPos > 2.4 && beatPos < 3.2)) {
      const kPhase = beatPos < 0.8 ? beatPos / 0.8 : (beatPos - 2.5) / 0.7;
      const kEnv = Math.exp(-Math.max(0, kPhase) * 12);
      kick = Math.sin(2 * Math.PI * 55 * t) * kEnv * 0.45;
    }

    // 4. Soft Snare / Rimshot (on beats 2 & 4)
    let snare = 0;
    const snarePhase2 = (currentBeat % 2);
    if (snarePhase2 > 0.95 && snarePhase2 < 1.4) {
      const sPhase = (snarePhase2 - 1.0) / 0.4;
      const sEnv = Math.exp(-Math.max(0, sPhase) * 16);
      snare = ((Math.random() * 2 - 1) * 0.7 + Math.sin(2 * Math.PI * 180 * t) * 0.3) * sEnv * 0.25;
    }

    samples[i] = (epiano + kick + snare + vinyl) * 0.85;
  }

  return samples;
}

/**
 * Dramatic Suspense (65 BPM, 16s loop, low cello drone, tension clock pulse)
 */
export function synthesizeDramaticSuspenseBGM(sampleRate = 44100) {
  const duration = 16.0;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;

    // 1. Deep Sub & Cello Drone (D minor: D2 73.4Hz + A2 110Hz + F2 87.3Hz)
    const lfo = 1 + 0.1 * Math.sin(2 * Math.PI * 0.2 * t);
    const sub = Math.sin(2 * Math.PI * 36.7 * t) * 0.35;
    const cello =
      (Math.sin(2 * Math.PI * 73.4 * t) +
        0.5 * Math.sin(2 * Math.PI * 110.0 * t) +
        0.3 * Math.sin(2 * Math.PI * 146.8 * t)) *
      0.18 *
      lfo;

    // 2. Tension Clock Ticking (Every 0.5s)
    const tickPhase = (t % 0.5) / 0.5;
    const tickEnv = Math.exp(-tickPhase * 60);
    const tick = Math.sin(2 * Math.PI * 1800 * t) * tickEnv * 0.15;

    // 3. Ominous Pulse Swell
    const pulsePhase = (t % 4.0) / 4.0;
    const pulseEnv = Math.sin(pulsePhase * Math.PI) ** 2;
    const pulse = Math.sin(2 * Math.PI * 130.8 * t) * pulseEnv * 0.15;

    samples[i] = (sub + cello + tick + pulse) * 0.85;
  }

  return samples;
}

/**
 * Cinematic Epic (90 BPM, 16s loop, brass swells, rolling timpani, orchestral rise)
 */
export function synthesizeCinematicEpicBGM(sampleRate = 44100) {
  const duration = 16.0;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;

    // 1. Swelling French Horn / Brass Chords (Bb -> F -> Gm -> Eb)
    const section = Math.floor(t / 4) % 4;
    const roots = [116.54, 87.31, 98.0, 77.78];
    const hornFreq = roots[section] * 2;
    const swellEnv = 0.5 + 0.5 * Math.sin((t / 4) * Math.PI);
    const horn = (Math.sin(2 * Math.PI * hornFreq * t) + 0.4 * Math.sin(4 * Math.PI * hornFreq * t)) * swellEnv * 0.28;

    // 2. Rolling Timpani Percussion
    const timpPhase = (t % 1.0) / 1.0;
    const timpEnv = Math.exp(-timpPhase * 6);
    const timpani = Math.sin(2 * Math.PI * (60 + 30 * timpEnv) * t) * timpEnv * 0.35;

    // 3. String Ostinato (High rhythmic pulse)
    const stringPhase = (t % 0.25) / 0.25;
    const stringEnv = Math.exp(-stringPhase * 10);
    const strings = Math.sin(2 * Math.PI * 587.33 * t) * stringEnv * 0.15;

    samples[i] = (horn + timpani + strings) * 0.85;
  }

  return samples;
}

/**
 * Playful & Fun (115 BPM, 16s loop, bouncy marimba & acoustic vibes)
 */
export function synthesizePlayfulFunBGM(sampleRate = 44100) {
  const bpm = 115;
  const beatSec = 60 / bpm;
  const duration = 16.0;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  const marimbaNotes = [523.25, 659.25, 783.99, 880.0, 1046.5]; // C5, E5, G5, A5, C6

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const currentBeat = (t / beatSec);

    // 1. Marimba Melody (bouncy syncopation)
    const step = Math.floor(t / (beatSec / 2)) % marimbaNotes.length;
    const noteFreq = marimbaNotes[step];
    const mPhase = (t % (beatSec / 2)) / (beatSec / 2);
    const mEnv = Math.exp(-mPhase * 14);
    const marimba = (Math.sin(2 * Math.PI * noteFreq * t) + 0.2 * Math.sin(3 * Math.PI * noteFreq * t)) * mEnv * 0.35;

    // 2. Bouncy Bass (Root 130.8Hz C3)
    const bassPhase = (t % beatSec) / beatSec;
    const bEnv = Math.exp(-bassPhase * 8);
    const bass = Math.sin(2 * Math.PI * 130.81 * t) * bEnv * 0.3;

    // 3. Hand Clap / Shaker on offbeats
    const clapPhase = ((t + beatSec * 0.5) % beatSec) / beatSec;
    const clapEnv = Math.exp(-clapPhase * 25);
    const clap = (Math.random() * 2 - 1) * clapEnv * 0.15;

    samples[i] = (marimba + bass + clap) * 0.85;
  }

  return samples;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ensure Audio Assets Exist on Disk
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Auto-creates and writes all BGM and SFX WAV audio files to public/assets/audio/
 */
export function ensureAudioAssets() {
  const baseDir = path.join(process.cwd(), 'public', 'assets', 'audio');
  const bgmDir = path.join(baseDir, 'bgm');
  const sfxDir = path.join(baseDir, 'sfx');

  if (!fs.existsSync(bgmDir)) fs.mkdirSync(bgmDir, { recursive: true });
  if (!fs.existsSync(sfxDir)) fs.mkdirSync(sfxDir, { recursive: true });

  const generators = [
    // SFX
    { file: path.join(sfxDir, 'pop.wav'), fn: synthesizePop },
    { file: path.join(sfxDir, 'whoosh.wav'), fn: synthesizeWhoosh },
    { file: path.join(sfxDir, 'swoosh.wav'), fn: synthesizeSwoosh },
    { file: path.join(sfxDir, 'ding.wav'), fn: synthesizeDing },
    { file: path.join(sfxDir, 'impact.wav'), fn: synthesizeImpact },
    { file: path.join(sfxDir, 'camera-shutter.wav'), fn: synthesizeCameraShutter },
    // BGM Loops
    { file: path.join(bgmDir, 'upbeat-energetic.wav'), fn: synthesizeUpbeatBGM },
    { file: path.join(bgmDir, 'chill-lofi.wav'), fn: synthesizeChillLofiBGM },
    { file: path.join(bgmDir, 'dramatic-suspense.wav'), fn: synthesizeDramaticSuspenseBGM },
    { file: path.join(bgmDir, 'cinematic-epic.wav'), fn: synthesizeCinematicEpicBGM },
    { file: path.join(bgmDir, 'playful-fun.wav'), fn: synthesizePlayfulFunBGM },
  ];

  for (const item of generators) {
    if (!fs.existsSync(item.file)) {
      try {
        const samples = item.fn();
        const buffer = createWavBuffer(samples, 44100, 1);
        fs.writeFileSync(item.file, buffer);
      } catch (err) {
        console.warn(`[Audio Assets] Failed generating ${path.basename(item.file)}:`, err);
      }
    }
  }
}

try {
  ensureAudioAssets();
} catch (e) {
  // Ignored in non-Node environments
}

