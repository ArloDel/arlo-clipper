// B-Roll Themes & Metadata (Client-safe)
export const BROLL_THEMES = [
  {
    id: 'finance',
    name: 'Finance & Money',
    icon: '💰',
    color: '#10b981',
    description: 'Grafik saham, uang tunai, investasi & cuan',
    assetPath: '/assets/broll/finance.png',
    keywords: [
      'uang', 'money', 'dollar', 'rupiah', 'bisnis', 'business', 'investasi', 'invest',
      'kaya', 'gaji', 'omset', 'untung', 'profit', 'modal', 'crypto', 'saham', 'finansial',
      'income', 'cuan', 'harga', 'mahal', 'dana', 'rekening', 'juta', 'miliar', 'keuangan',
      'passive income', 'tabungan', 'cashflow', 'aset', 'omzet'
    ],
  },
  {
    id: 'technology',
    name: 'Tech & AI',
    icon: '🤖',
    color: '#3b82f6',
    description: 'Cyber network, robotik, coding & masa depan',
    assetPath: '/assets/broll/technology.png',
    keywords: [
      'ai', 'robot', 'coding', 'program', 'software', 'komputer', 'computer', 'teknologi',
      'technology', 'internet', 'algoritma', 'algorithm', 'future', 'gadget', 'smartphone',
      'developer', 'cyber', 'data', 'sistem', 'artificial intelligence', 'machine learning',
      'cloud', 'server', 'digital', 'tech', 'device', 'aplikasi', 'app'
    ],
  },
  {
    id: 'success',
    name: 'Motivation & Success',
    icon: '🚀',
    color: '#8b5cf6',
    description: 'Pertumbuhan cepat, roket meluncur & kemenangan',
    assetPath: '/assets/broll/success.png',
    keywords: [
      'sukses', 'success', 'motivasi', 'growth', 'target', 'menang', 'winner', 'goal',
      'scale', 'juara', 'tips', 'berhasil', 'rahasia', 'level', 'impian', 'semangat',
      'pemenang', 'fokus', 'mindset', 'disiplin', 'tumbuh', 'karir', 'prestasi', 'capai',
      'produktivitas', 'hebat', 'berkembang'
    ],
  },
  {
    id: 'alert',
    name: 'Alert & Warning',
    icon: '⚠️',
    color: '#ef4444',
    description: 'Peringatan bahaya, awas, & hal penting yang jangan dilewatkan',
    assetPath: '/assets/broll/alert.png',
    keywords: [
      'stop', 'awas', 'bahaya', 'penting', 'warning', 'jangan', 'hati-hati', 'viral',
      'urgent', 'kesalahan', 'mistake', 'masalah', 'problem', 'dilarang', 'alert', 'kritis',
      'fatal', 'waspada', 'hati', 'ancaman', 'rugi', 'jebakan', 'scam', 'penipuan'
    ],
  },
  {
    id: 'nature',
    name: 'Nature & Relax',
    icon: '🌿',
    color: '#06b6d4',
    description: 'Pemandangan alam, ketenangan, travelling & eksplorasi',
    assetPath: '/assets/broll/nature.png',
    keywords: [
      'relax', 'alam', 'jalan', 'travel', 'liburan', 'santai', 'dunia', 'gunung',
      'pantai', 'laut', 'udara', 'explore', 'suasana', 'trip', 'adventure', 'healing',
      'pemandangan', 'tenang', 'hutan', 'destinasi', 'holiday', 'pesona'
    ],
  },
  {
    id: 'celebration',
    name: 'Celebration & Party',
    icon: '🎉',
    color: '#f59e0b',
    description: 'Konfeti, perayaan meriah & pencapaian luar biasa',
    assetPath: '/assets/broll/celebration.png',
    keywords: [
      'wow', 'hebat', 'party', 'selamat', 'pesta', 'celebrate', 'keren', 'luar biasa',
      'gokil', 'mantap', 'happy', 'merayakan', 'asyik', 'congrats', 'cheers', 'meriah',
      'kemenangan', 'party time'
    ],
  },
];

/**
 * Smart Keyword Matcher: Analyzes transcript segments and hook to generate optimal B-Roll overlay triggers
 */
export function detectAutoBroll(segments = [], hook = '', themeOverride = null) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return [];
  }

  const overlays = [];
  let lastOverlayEnd = -999;
  const minGapBetweenOverlays = 0.5;

  const isAuto = !themeOverride || themeOverride === 'auto';
  const forcedTheme = !isAuto ? BROLL_THEMES.find((t) => t.id === themeOverride) : null;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segStart = typeof seg.start === 'number' ? seg.start : Number(seg.start) || 0;
    const segEnd = typeof seg.end === 'number' ? seg.end : Number(seg.end) || (segStart + 3);
    const segText = (seg.text || '').toLowerCase();

    if (segStart < lastOverlayEnd + minGapBetweenOverlays) {
      continue;
    }

    let matchedTheme = null;
    let matchedKeyword = '';

    if (forcedTheme) {
      if (i === 0 || i % 3 === 0 || segEnd - segStart >= 2.5) {
        matchedTheme = forcedTheme;
        matchedKeyword = forcedTheme.name;
      }
    } else {
      let bestScore = 0;
      for (const theme of BROLL_THEMES) {
        for (const kw of theme.keywords) {
          const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i');
          if (regex.test(segText)) {
            const score = kw.length >= 5 ? 2 : 1;
            if (score > bestScore) {
              bestScore = score;
              matchedTheme = theme;
              matchedKeyword = kw;
            }
          }
        }
      }
    }

    if (matchedTheme) {
      const duration = Math.min(3.5, Math.max(2.2, segEnd - segStart));
      const start = Number(Math.max(0, segStart).toFixed(2));
      const end = Number((start + duration).toFixed(2));

      overlays.push({
        id: `broll-${overlays.length + 1}-${matchedTheme.id}`,
        theme: matchedTheme.id,
        themeName: matchedTheme.name,
        icon: matchedTheme.icon,
        color: matchedTheme.color,
        start,
        end,
        duration: Number(duration.toFixed(2)),
        assetPath: matchedTheme.assetPath,
        keyword: matchedKeyword,
        label: `${matchedTheme.icon} ${matchedTheme.name} ("${matchedKeyword}")`,
      });

      lastOverlayEnd = end;
    }
  }

  if (overlays.length === 0 && segments.length > 0) {
    const defaultTheme = forcedTheme || BROLL_THEMES[0];
    const firstSeg = segments[0];
    const firstStart = typeof firstSeg.start === 'number' ? firstSeg.start : 0;
    const start = Number((firstStart + 0.5).toFixed(2));
    const duration = 2.8;
    const end = Number((start + duration).toFixed(2));

    overlays.push({
      id: `broll-1-${defaultTheme.id}`,
      theme: defaultTheme.id,
      themeName: defaultTheme.name,
      icon: defaultTheme.icon,
      color: defaultTheme.color,
      start,
      end,
      duration,
      assetPath: defaultTheme.assetPath,
      keyword: 'Hook Visual',
      label: `${defaultTheme.icon} ${defaultTheme.name} (Hook Visual)`,
    });
  }

  return overlays;
}
