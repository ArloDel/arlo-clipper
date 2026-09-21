/**
 * Virality Score & Hook Analyzer Engine for Arlo Clipper
 * Evaluates video clips on a 0–100 scale based on:
 * - 40% Hook Strength (First 3s power, curiosity gap, power words, brevity, direct address, specificity)
 * - 30% Speech Pacing (Exact WPM, Shorts tempo zone 135-170 WPM, pause penalties)
 * - 30% Emotional Trigger (Curiosity, Urgency, Humor, Inspiration, Controversy)
 */

// Power words lexicon (Indonesian & English)
const POWER_WORDS = [
  // Indonesian
  'rahasia', 'trik', 'hack', 'hacks', 'terbongkar', 'gila', 'shocking', 'omg',
  'ultimate', 'stop', 'jangan', 'bukti', 'insane', 'kesalahan', 'bahaya', 'viral',
  'mindblowing', 'terbaik', 'terburuk', 'terlarang', 'wajib', 'bocoran', 'terungkap',
  'warning', 'never', 'must', 'proven', 'crazy', 'unbelievable', 'secret', 'secrets',
  'hidden', 'scam', 'dilarang', 'rugi', 'nyesel', 'menyesal', 'kaya', 'sukses',
  'cepat', 'mudah', 'ampuh', 'ajaib', 'luar biasa', 'fakta', 'misteri', 'bencana',
  'fatal', 'gratis', 'tercepat', 'profit', 'cuan', 'auto', 'terbukti', 'terkejut',
  'kaget', 'awas', 'waspada', 'penting', 'pentingnya', 'hancur', 'meledak', 'bohong',
  'kebohongan', 'zonk', 'jebakan', 'hebat', 'luarbiasa', 'dahsyat', 'ajaib', 'spesial',
  // English
  'insane', 'shocking', 'stop', 'secret', 'secrets', 'exposed', 'warning', 'never',
  'always', 'hidden', 'danger', 'mistake', 'ultimate', 'hack', 'hacks', 'crazy',
  'unbelievable', 'proven', 'fail', 'winning', 'money', 'free', 'worst', 'best',
  'magic', 'genius', 'instant', 'truth', 'lies', 'banned', 'illegal', 'scandal'
];

const DIRECT_ADDRESS_WORDS = [
  'kamu', 'anda', 'kalian', 'lu', 'lo', 'loe', 'kita', 'elo', 'bro', 'sis', 'guys',
  'you', 'your', 'yours', 'we', 'our'
];

const QUESTION_STARTERS = [
  'kenapa', 'mengapa', 'bagaimana', 'tahukah kamu', 'tahukah anda', 'tahukah kalian',
  'pernah gak', 'pernahkah', 'siapa bilang', 'apa jadinya', 'apa yang terjadi',
  'kenapa orang', 'kenapa banyak', 'mau tahu', 'mau tau',
  'why', 'how', 'what if', 'did you know', 'have you ever', 'what happens when',
  'who said', 'do you know'
];

const EMOTIONAL_LEXICON = {
  curiosity: [
    'kenapa', 'mengapa', 'rahasia', 'tahukah', 'ternyata', 'misteri', 'bocoran',
    'terungkap', 'fakta', 'alasan', 'why', 'how', 'secret', 'mystery', 'reveal',
    'actually', 'hidden', 'untold', 'truth', 'bukti', 'penasaran', 'dibalik', 'aneh'
  ],
  urgency: [
    'gila', 'shocking', 'omg', 'bahaya', 'fatal', 'stop', 'jangan', 'peringatan',
    'warning', 'urgent', 'scam', 'rugi', 'menyesal', 'nyesel', 'awas', 'terlarang',
    'bencana', 'darurat', 'alert', 'insane', 'crazy', 'unbelievable', 'sekarang', 'cepat',
    'sebelum terlambat', 'terancam', 'waspada'
  ],
  humor: [
    'lucu', 'ngakak', 'kocak', 'relate', 'parah', 'lawak', 'wkwk', 'haha', 'meme',
    'jokes', 'funny', 'hilarious', 'relatable', 'absurd', 'konyol', 'gokil', 'receh',
    'gemas', 'lawakan'
  ],
  inspiration: [
    'sukses', 'berhasil', 'motivasi', 'tips', 'trik', 'cara', 'strategi', 'hebat',
    'kaya', 'cuan', 'profit', 'belajar', 'upgrade', 'mindset', 'success', 'growth',
    'inspire', 'achieve', 'guide', 'lesson', 'tumbuh', 'menang', 'bangkit', 'merdeka',
    'hebat', 'berkembang', 'potensi'
  ],
  controversy: [
    'debat', 'salah', 'keliru', 'kebohongan', 'mitos', 'vs', 'lawan', 'kontroversi',
    'jangan beli', 'bohong', 'unpopular', 'opinion', 'fake', 'myth', 'mistake',
    'disagree', 'beda', 'hujat', 'sindir', 'bongkar', 'aib', 'bukan'
  ]
};

/**
 * Clean and normalize text tokens (with CJK & non-Latin character support)
 */
export function tokenize(text = '') {
  if (text == null) return [];
  const rawStr = typeof text === 'string' ? text : String(text);
  if (!rawStr.trim()) return [];

  // Match Latin words/numbers or individual CJK characters
  const cleaned = rawStr.toLowerCase();
  const cjkChars = cleaned.match(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g) || [];
  const latinTokens = cleaned
    .replace(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, ' ')
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  return [...latinTokens, ...cjkChars];
}

/**
 * 1. Calculate Hook Strength (0–100)
 */
export function calculateHookStrength(hookText = '', options = {}) {
  const rawText = typeof hookText === 'string' ? hookText : (hookText != null ? String(hookText) : '');
  const cleanHook = rawText.trim();
  if (!cleanHook) {
    return {
      score: 45,
      hasQuestion: false,
      hasDirectAddress: false,
      hasPowerWords: false,
      powerWordsFound: [],
      hasNumbers: false,
      wordCount: 0,
      openingScore: 45,
      brevityScore: 50,
      details: {
        brevityLabel: 'Missing Hook',
        analysis: 'Hook text is empty. Add an opening punchline.',
      },
    };
  }

  const tokens = tokenize(cleanHook);
  const lowerText = cleanHook.toLowerCase();
  const wordCount = tokens.length;

  // A. Brevity & Word Density (Optimal: 4–14 words for first 3-second hook)
  let brevityScore = 70;
  let brevityLabel = 'Good Length';
  if (wordCount >= 4 && wordCount <= 12) {
    brevityScore = 95;
    brevityLabel = 'Punchy & Optimal (4–12 words)';
  } else if (wordCount >= 13 && wordCount <= 16) {
    brevityScore = 85;
    brevityLabel = 'Good Length (13–16 words)';
  } else if (wordCount < 4) {
    brevityScore = 60;
    brevityLabel = 'A bit too short (<4 words)';
  } else {
    brevityScore = Math.max(40, 85 - (wordCount - 16) * 4);
    brevityLabel = 'Too long for first 3s (>16 words)';
  }

  // B. Curiosity Gap / Question Hook
  const hasQuestionMark = cleanHook.includes('?');
  const hasQuestionStarter = QUESTION_STARTERS.some((q) => {
    return lowerText.startsWith(q) || lowerText.includes(` ${q}`) || tokens.includes(q);
  });
  const hasQuestion = hasQuestionMark || hasQuestionStarter;
  const questionPoints = hasQuestion ? 24 : 0;

  // C. Power Words (Exact token match for single-words, substring match for multi-words)
  const matchedPowerWords = Array.from(
    new Set(
      POWER_WORDS.filter((pw) =>
        pw.includes(' ') ? lowerText.includes(pw) : tokens.includes(pw)
      )
    )
  );
  const hasPowerWords = matchedPowerWords.length > 0;
  const powerWordPoints = Math.min(26, matchedPowerWords.length * 13);

  // D. Direct Address ('kamu', 'anda', 'you', etc.)
  const hasDirectAddress = DIRECT_ADDRESS_WORDS.some(
    (da) => tokens.includes(da) || (da.includes(' ') && lowerText.includes(da))
  );
  const directAddressPoints = hasDirectAddress ? 18 : 0;

  // E. Specificity & Numbers ('3 Alasan', '10x', '100%', 'Rp 100jt', etc.)
  const hasNumbers = /\b(\d+|10x|100%|rp|juta|miliar|ribu|dollar|\$|%)\b/i.test(cleanHook);
  const numberPoints = hasNumbers ? 16 : 0;

  // F. Opening Impact (First 3-second word power)
  const first5Tokens = tokens.slice(0, 5);
  const first5Words = first5Tokens.join(' ');
  const hasHighImpactOpening =
    hasQuestionStarter ||
    POWER_WORDS.some((pw) => (pw.includes(' ') ? first5Words.includes(pw) : first5Tokens.includes(pw))) ||
    DIRECT_ADDRESS_WORDS.some((da) => (da.includes(' ') ? first5Words.includes(da) : first5Tokens.includes(da)));
  const openingBonus = hasHighImpactOpening ? 10 : 0;

  // Base score calculation
  const rawScore = 32 + (brevityScore * 0.2) + questionPoints + powerWordPoints + directAddressPoints + numberPoints + openingBonus;
  const score = Math.max(20, Math.min(100, Math.round(rawScore)));

  return {
    score,
    hasQuestion,
    hasDirectAddress,
    hasPowerWords,
    powerWordsFound: matchedPowerWords.slice(0, 5),
    hasNumbers,
    wordCount,
    brevityScore,
    openingScore: hasHighImpactOpening ? 95 : 70,
    details: {
      brevityLabel,
      hasHighImpactOpening,
    },
  };
}

/**
 * 2. Calculate Speech Pacing / Words-Per-Minute (0–100)
 */
export function calculateSpeechPacing({
  segments = [],
  words = [],
  text = '',
  duration = 0,
}) {
  let totalWords = 0;
  let effectiveDuration = Number(duration) || 0;

  if (Array.isArray(words) && words.length > 0) {
    totalWords = words.filter((w) => {
      const token = typeof w === 'string' ? w : (w?.word || '');
      return token.trim().length > 0;
    }).length;
  } else if (Array.isArray(segments) && segments.length > 0) {
    const segWords = segments.flatMap((s) => {
      if (Array.isArray(s.words) && s.words.length > 0) {
        return s.words.filter((w) => {
          const token = typeof w === 'string' ? w : (w?.word || '');
          return token.trim().length > 0;
        });
      }
      return tokenize(s.text);
    });
    totalWords = segWords.length;
    if (effectiveDuration <= 0) {
      const ends = segments.map((s) => Number(s.end) || 0).filter((n) => n > 0);
      const starts = segments.map((s) => Number(s.start) || 0);
      if (ends.length > 0) {
        const maxEnd = Math.max(...ends);
        const minStart = Math.min(...starts);
        effectiveDuration = Math.max(1, maxEnd - minStart);
      }
    }
  } else if (text) {
    totalWords = tokenize(text).length;
  }

  // Handle empty audio / no speech
  if (totalWords === 0) {
    return {
      score: 50,
      wpm: 0,
      totalWords: 0,
      durationSec: Number(effectiveDuration.toFixed(1)),
      optimalRange: '135–170 WPM',
      tempoStatus: 'No Speech Detected',
      tempoFeedback: 'Belum ada transkrip vokal terdeteksi pada klip ini.',
      pauseCount: 0,
      pausePenalty: 0,
    };
  }

  // Default duration fallback if unavailable
  if (effectiveDuration <= 0) {
    effectiveDuration = Math.max(15, Math.round(totalWords / 2.5));
  }

  const minutes = effectiveDuration / 60;
  const wpm = minutes > 0 ? Math.round(totalWords / minutes) : 150;

  // Evaluate Shorts/Reels optimal tempo zone: 135–170 WPM
  let paceScore = 80;
  let tempoStatus = 'Optimal Tempo';
  let tempoFeedback = 'Pacing sangat ideal untuk YouTube Shorts & Instagram Reels (135–170 WPM).';

  if (wpm >= 135 && wpm <= 170) {
    paceScore = 96;
    tempoStatus = 'Optimal Tempo';
    tempoFeedback = 'Pacing sangat ideal untuk YouTube Shorts & Instagram Reels (135–170 WPM).';
  } else if (wpm >= 120 && wpm < 135) {
    paceScore = 86;
    tempoStatus = 'Slightly Slow';
    tempoFeedback = 'Tempo vokal sedikit santai (120–134 WPM). Masih sangat jelas dipahami audiens.';
  } else if (wpm > 170 && wpm <= 195) {
    paceScore = 88;
    tempoStatus = 'Fast & Energetic';
    tempoFeedback = 'Tempo vokal berenergi tinggi (171–195 WPM), cocok untuk konten aksi/edukasi cepat.';
  } else if (wpm >= 95 && wpm < 120) {
    paceScore = 70;
    tempoStatus = 'Slow Pacing';
    tempoFeedback = 'Tempo vokal agak lambat (<120 WPM), berisiko memicu swipe-away audiens.';
  } else if (wpm > 195 && wpm <= 225) {
    paceScore = 72;
    tempoStatus = 'Very Fast';
    tempoFeedback = 'Tempo vokal sangat cepat (>195 WPM), sebagian audiens mungkin kesulitan menangkap kata.';
  } else if (wpm < 95) {
    paceScore = Math.max(30, Math.round(wpm * 0.6));
    tempoStatus = 'Too Slow';
    tempoFeedback = 'Tempo terlalu lambat untuk format video pendek (<95 WPM). Pangkas jeda hening.';
  } else {
    // > 225
    paceScore = Math.max(35, 100 - (wpm - 170) * 0.9);
    tempoStatus = 'Too Fast';
    tempoFeedback = 'Tempo terlalu cepat (>225 WPM). Kurangi kecepatan agar artikulasi tetap jelas.';
  }

  // Detect long awkward pauses if word timestamps exist
  let pausePenalty = 0;
  let pauseCount = 0;
  if (Array.isArray(words) && words.length > 1) {
    for (let i = 0; i < words.length - 1; i++) {
      const curEnd = Number(words[i]?.end);
      const nextStart = Number(words[i + 1]?.start);
      if (!isNaN(curEnd) && !isNaN(nextStart) && curEnd > 0 && nextStart >= curEnd) {
        const gap = nextStart - curEnd;
        if (gap >= 1.4) {
          pauseCount++;
          pausePenalty += Math.min(6, Math.round(gap * 3));
        }
      }
    }
  } else if (Array.isArray(segments) && segments.length > 1) {
    for (let i = 0; i < segments.length - 1; i++) {
      const curEnd = Number(segments[i]?.end);
      const nextStart = Number(segments[i + 1]?.start);
      if (!isNaN(curEnd) && !isNaN(nextStart) && curEnd > 0 && nextStart >= curEnd) {
        const gap = nextStart - curEnd;
        if (gap >= 1.8) {
          pauseCount++;
          pausePenalty += Math.min(8, Math.round(gap * 3));
        }
      }
    }
  }

  pausePenalty = Math.min(22, pausePenalty);
  const finalScore = Math.max(25, Math.min(100, Math.round(paceScore - pausePenalty)));

  return {
    score: finalScore,
    wpm,
    totalWords,
    durationSec: Number(effectiveDuration.toFixed(1)),
    optimalRange: '135–170 WPM',
    tempoStatus,
    tempoFeedback,
    pauseCount,
    pausePenalty,
  };
}

/**
 * 3. Calculate Emotional Trigger & Retention Score (0–100)
 */
export function calculateEmotionalTrigger(fullText = '') {
  const rawText = typeof fullText === 'string' ? fullText : (fullText != null ? String(fullText) : '');
  const clean = rawText.trim();
  if (!clean) {
    return {
      score: 50,
      dominantEmotion: 'Curiosity & Mystery',
      dominantEmotionKey: 'curiosity',
      dominantEmotionEmoji: '🔍',
      emotionScores: {
        curiosity: 50,
        urgency: 45,
        humor: 40,
        inspiration: 45,
        controversy: 40,
      },
      emotionalKeywords: [],
    };
  }

  const tokens = tokenize(clean);
  const lower = clean.toLowerCase();

  const counts = {
    curiosity: 0,
    urgency: 0,
    humor: 0,
    inspiration: 0,
    controversy: 0,
  };

  const matchedKeywords = [];

  for (const [category, wordsList] of Object.entries(EMOTIONAL_LEXICON)) {
    for (const word of wordsList) {
      const isMatched = word.includes(' ')
        ? lower.includes(word)
        : tokens.includes(word);
      if (isMatched) {
        counts[category] += 1;
        if (!matchedKeywords.includes(word)) {
          matchedKeywords.push(word);
        }
      }
    }
  }

  // Punctuation & Excitement signals
  const exclamationCount = (clean.match(/!/g) || []).length;
  const questionCount = (clean.match(/\?/g) || []).length;
  const contrastWords = ['tapi', 'namun', 'padahal', 'ternyata', 'tetapi', 'but', 'however', 'actually', 'suddenly'];
  const contrastCount = contrastWords.filter((w) => tokens.includes(w) || lower.includes(` ${w} `)).length;

  counts.urgency += Math.min(3, exclamationCount);
  counts.curiosity += Math.min(3, questionCount) + Math.min(3, contrastCount);

  // Compute sub-scores (0-100)
  const computeCatScore = (cnt) => Math.min(100, 42 + cnt * 18);
  const emotionScores = {
    curiosity: computeCatScore(counts.curiosity),
    urgency: computeCatScore(counts.urgency),
    humor: computeCatScore(counts.humor),
    inspiration: computeCatScore(counts.inspiration),
    controversy: computeCatScore(counts.controversy),
  };

  // Find dominant emotion
  let dominantEmotionKey = 'curiosity';
  let maxCount = -1;
  for (const [cat, cnt] of Object.entries(counts)) {
    if (cnt > maxCount) {
      maxCount = cnt;
      dominantEmotionKey = cat;
    }
  }

  const emotionLabels = {
    curiosity: { label: 'Curiosity & Mystery', emoji: '🔍' },
    urgency: { label: 'Shock & Urgency', emoji: '⚡' },
    humor: { label: 'Humor & Relatability', emoji: '😂' },
    inspiration: { label: 'Inspiration & Growth', emoji: '🚀' },
    controversy: { label: 'Controversy & Debate', emoji: '🔥' },
  };

  const highestScore = Math.max(...Object.values(emotionScores));
  const rawOverall = (highestScore * 0.6) + ((emotionScores.curiosity + emotionScores.urgency) * 0.2);
  const score = Math.max(30, Math.min(100, Math.round(rawOverall)));

  return {
    score,
    dominantEmotion: emotionLabels[dominantEmotionKey]?.label || 'Curiosity & Mystery',
    dominantEmotionKey,
    dominantEmotionEmoji: emotionLabels[dominantEmotionKey]?.emoji || '🔍',
    emotionScores,
    emotionalKeywords: matchedKeywords.slice(0, 6),
  };
}

/**
 * Grade & Badge categorizer
 */
export function getViralityGrade(score = 0) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (s >= 90) {
    return {
      grade: 'A+',
      gradeLabel: 'Grade A+',
      badge: 'High Viral Potential',
      badgeEmoji: '🔥',
      color: '#10b981', // Emerald green
      bgGradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.1) 100%)',
      borderColor: 'rgba(16, 185, 129, 0.4)',
      summary: 'Klip ini memiliki peluang viral sangat tinggi dengan hook tajam dan ritme optimal.',
    };
  }
  if (s >= 80) {
    return {
      grade: 'A',
      gradeLabel: 'Grade A',
      badge: 'Good Viral Potential',
      badgeEmoji: '⚡',
      color: '#3b82f6', // Bright Blue
      bgGradient: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(37, 99, 235, 0.1) 100%)',
      borderColor: 'rgba(59, 130, 246, 0.4)',
      summary: 'Struktur klip solid dengan daya tarik penonton yang kuat.',
    };
  }
  if (s >= 65) {
    return {
      grade: 'B',
      gradeLabel: 'Grade B',
      badge: 'Moderate Potential',
      badgeEmoji: '💡',
      color: '#f59e0b', // Amber / Gold
      bgGradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(217, 119, 6, 0.1) 100%)',
      borderColor: 'rgba(245, 158, 11, 0.4)',
      summary: 'Potensi cukup baik, dapat ditingkatkan lagi dengan hook yang lebih provokatif.',
    };
  }
  return {
    grade: 'C',
    gradeLabel: 'Grade C',
    badge: 'Needs Optimization',
    badgeEmoji: '⚠️',
    color: '#ef4444', // Rose / Red
    bgGradient: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.1) 100%)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    summary: 'Perlu optimasi pada kalimat pembuka dan tempo agar retensi penonton tidak anjlok.',
  };
}

/**
 * Generate Actionable Optimization Tips
 */
export function generateOptimizationTips({
  hookStrength,
  speechPacing,
  emotionalTrigger,
  hookText = '',
}) {
  const tips = [];

  // 1. Hook Specific Tips
  if (!hookStrength.hasDirectAddress) {
    tips.push('Gunakan kata sapaan langsung seperti "kamu", "kalian", atau "you" di awal video untuk membangun koneksi instan.');
  }

  if (!hookStrength.hasQuestion && !hookStrength.hasPowerWords) {
    tips.push('Sisipkan kata pemicu emosi (Power Words) seperti "Rahasia", "Trik Tersembunyi", atau "Jangan Lakukan Ini".');
  } else if (!hookStrength.hasQuestion) {
    tips.push('Awali 3 detik pertama dengan pertanyaan penasaran (Curiosity Gap) untuk memangkas angka swipe-away.');
  }

  if (hookStrength.wordCount > 15) {
    tips.push('Persingkat kalimat hook (maksimal 6–12 kata) agar pesan langsung tersampaikan sebelum penonton bosan.');
  }

  if (!hookStrength.hasNumbers) {
    tips.push('Sertakan angka spesifik (misal: "3 Kesalahan", "10x Lipat", "100%") untuk mendongkrak kredibilitas.');
  }

  // 2. Speech Pacing Tips
  if (speechPacing.tempoStatus === 'No Speech Detected') {
    tips.push('Tambahkan narasi suara atau transkrip audio agar penonton dapat mengikuti alur cerita video.');
  } else if (speechPacing.wpm < 130) {
    tips.push(`Tempo vokal saat ini (${speechPacing.wpm} WPM) agak lambat. Tingkatkan ritme bicara atau pangkas jeda hening agar mencapai 135–170 WPM.`);
  } else if (speechPacing.wpm > 185) {
    tips.push(`Tempo vokal sangat cepat (${speechPacing.wpm} WPM). Berikan mikro-jeda pada kata kunci utama agar penonton sempat memproses ide.`);
  } else if (speechPacing.pauseCount > 2) {
    tips.push(`Terdeteksi ${speechPacing.pauseCount} jeda hening di atas 1.5 detik. Potong jeda ini di timeline editor.`);
  } else {
    tips.push(`Pacing vokal berada di tempo emas (${speechPacing.wpm} WPM). Pertahankan dinamika intonasi ini.`);
  }

  // 3. Emotional Trigger Tips
  if (emotionalTrigger.score < 68) {
    tips.push(`Perkuat pemicu emosi (${emotionalTrigger.dominantEmotion}) dengan menambahkan unsur kontras dramatis ("padahal / ternyata").`);
  }

  // 4. Fallback High-Performance Best Practices
  if (tips.length < 2) {
    if (hookStrength.score >= 90) {
      tips.push('Hook 3 detik pertama sangat kuat! Gunakan animasi Pop/Karaoke pada subtitle pembuka untuk memaksimalkan retensi visual.');
    } else {
      tips.push('Gunakan visual B-Roll atau sound effect (Whoosh/Impact) tepat saat kalimat hook pertama diucapkan.');
    }
  }
  if (tips.length < 2) {
    tips.push('Tambahkan sound effect (SFX) atau BGM ducking dinamis pada 3 detik awal agar hook terdengar lebih punchy.');
  }

  // Ensure 2–4 tips returned
  return tips.slice(0, 4);
}

/**
 * Extract clean main topic keywords from hook/title
 */
function extractTopic(text = '') {
  if (text == null) return 'topik ini';
  const rawStr = typeof text === 'string' ? text : String(text);
  if (!rawStr.trim()) return 'topik ini';

  const clean = rawStr
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/^(jangan|tahukah kamu|tahukah anda|kenapa|mengapa|rahasia|cara|inilah|ternyata|tips|trik|did you know|why|how to|what if|have you ever|who said|stop|secret of|the real truth about)\s+/i, '')
    .replace(/[?!.,]/g, '')
    .trim();
  const words = clean.split(/\s+/).slice(0, 5).join(' ');
  return words || 'topik ini';
}

/**
 * Generate 2-3 High-Converting AI Alternative Viral Hooks
 */
export function generateAlternativeHooks({
  hook = '',
  title = '',
  text = '',
  dominantEmotionKey = 'curiosity',
}) {
  const baseTopic = extractTopic(hook || title || text);
  const isEnglish = /\b(the|and|this|what|why|how|secret|you|is|money|fail|traders)\b/i.test(`${hook} ${title}`);

  if (isEnglish) {
    return [
      {
        id: 'alt-1',
        style: 'Curiosity Gap',
        hook: `Don't scroll! The real truth about ${baseTopic} will shock you...`,
        badge: '🔥 96% Retention',
        type: 'curiosity',
      },
      {
        id: 'alt-2',
        style: 'Contrarian Challenge',
        hook: `Stop doing ${baseTopic} the old way! Here is what actually works:`,
        badge: '⚡ High Engagement',
        type: 'contrarian',
      },
      {
        id: 'alt-3',
        style: 'Secret / Numbered Hack',
        hook: `Why 90% of people fail at ${baseTopic} (and the 1 fix you need)...`,
        badge: '💡 Viral Listicle',
        type: 'listicle',
      },
    ];
  }

  // Indonesian viral templates
  return [
    {
      id: 'alt-1',
      style: 'Curiosity Gap (Misteri)',
      hook: `Jangan di-skip! Ternyata ini rahasia di balik ${baseTopic} yang jarang dibahas...`,
      badge: '🔥 96% Retention',
      type: 'curiosity',
    },
    {
      id: 'alt-2',
      style: 'Contrarian (Stop Kebiasaan)',
      hook: `Stop lakukan ini kalau kamu mau ${baseTopic}! Trik 10 detiknya ada di sini:`,
      badge: '⚡ High Engagement',
      type: 'contrarian',
    },
    {
      id: 'alt-3',
      style: 'Provocative Question (Angka)',
      hook: `Kenapa 90% orang salah paham soal ${baseTopic}? Simak 1 faktanya!`,
      badge: '💡 Viral Hook',
      type: 'question',
    },
  ];
}

/**
 * Main Master Virality Scoring Function
 * Accepts flexible payload from analyze, prepare-editor, webhookPipeline, and UI editor
 */
export function calculateViralityScore(input = {}) {
  // Normalize string or invalid inputs
  let normalizedInput = input;
  if (typeof input === 'string') {
    normalizedInput = { hook: input, title: input };
  } else if (!input || typeof input !== 'object') {
    normalizedInput = {};
  }

  const hook = normalizedInput.hook || normalizedInput.title || '';
  const title = normalizedInput.title || '';
  const caption = normalizedInput.caption || '';
  const segments = Array.isArray(normalizedInput.segments) ? normalizedInput.segments : [];
  const words = Array.isArray(normalizedInput.words) ? normalizedInput.words : [];
  const duration = Number(normalizedInput.duration || normalizedInput.durationSec || 0);

  // Combine available text for full emotional & lexical context
  const fullText = [
    hook,
    title,
    caption,
    segments.map((s) => s.text || '').join(' '),
    normalizedInput.transcript || normalizedInput.text || '',
  ]
    .filter(Boolean)
    .join(' ');

  // 1. Calculate Component Scores
  const hookStrength = calculateHookStrength(hook);
  const speechPacing = calculateSpeechPacing({
    segments,
    words,
    text: fullText,
    duration,
  });
  const emotionalTrigger = calculateEmotionalTrigger(fullText);

  // 2. Weighted Overall Score (40% Hook + 30% Pacing + 30% Emotional Trigger)
  const weightedHook = hookStrength.score * 0.40;
  const weightedPacing = speechPacing.score * 0.30;
  const weightedEmotion = emotionalTrigger.score * 0.30;
  const overallScore = Math.max(0, Math.min(100, Math.round(weightedHook + weightedPacing + weightedEmotion)));

  // 3. Badge & Grade Info
  const gradeInfo = getViralityGrade(overallScore);

  // 4. Optimization Tips
  const tips = generateOptimizationTips({
    hookStrength,
    speechPacing,
    emotionalTrigger,
    hookText: hook,
  });

  // 5. Alternative AI Hooks
  const alternativeHooks = generateAlternativeHooks({
    hook,
    title,
    text: fullText,
    dominantEmotionKey: emotionalTrigger.dominantEmotionKey,
  });

  return {
    score: overallScore,
    grade: gradeInfo.grade,
    gradeLabel: gradeInfo.gradeLabel,
    badge: gradeInfo.badge,
    badgeEmoji: gradeInfo.badgeEmoji,
    color: gradeInfo.color,
    bgGradient: gradeInfo.bgGradient,
    borderColor: gradeInfo.borderColor,
    summary: gradeInfo.summary,
    breakdown: {
      hookStrength: {
        score: hookStrength.score,
        weight: 0.40,
        weightedScore: Number(weightedHook.toFixed(1)),
        hasQuestion: hookStrength.hasQuestion,
        hasDirectAddress: hookStrength.hasDirectAddress,
        hasPowerWords: hookStrength.hasPowerWords,
        powerWordsFound: hookStrength.powerWordsFound,
        hasNumbers: hookStrength.hasNumbers,
        wordCount: hookStrength.wordCount,
        brevityLabel: hookStrength.details.brevityLabel,
      },
      speechPacing: {
        score: speechPacing.score,
        weight: 0.30,
        weightedScore: Number(weightedPacing.toFixed(1)),
        wpm: speechPacing.wpm,
        optimalRange: speechPacing.optimalRange,
        tempoStatus: speechPacing.tempoStatus,
        tempoFeedback: speechPacing.tempoFeedback,
        pauseCount: speechPacing.pauseCount,
        pausePenalty: speechPacing.pausePenalty,
      },
      emotionalTrigger: {
        score: emotionalTrigger.score,
        weight: 0.30,
        weightedScore: Number(weightedEmotion.toFixed(1)),
        dominantEmotion: emotionalTrigger.dominantEmotion,
        dominantEmotionEmoji: emotionalTrigger.dominantEmotionEmoji,
        emotionScores: emotionalTrigger.emotionScores,
        emotionalKeywords: emotionalTrigger.emotionalKeywords,
      },
    },
    tips,
    alternativeHooks,
    calculatedAt: new Date().toISOString(),
  };
}
