import assert from 'assert';
import {
  tokenize,
  calculateHookStrength,
  calculateSpeechPacing,
  calculateEmotionalTrigger,
  getViralityGrade,
  generateOptimizationTips,
  generateAlternativeHooks,
  calculateViralityScore,
} from '../lib/viralityScore.js';

console.log('=== ⚡ Starting AI Virality Score & Hook Analyzer Test Suite ===\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Hook Strength Evaluation
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 1: Hook Strength Engine ---');

// 1.1 High-powered viral hook with Question + Direct Address + Power Word + Number
const strongHook = 'Tahukah kamu 3 rahasia gila agar video TikTok kamu meledak?';
const strongHookRes = calculateHookStrength(strongHook);
console.log(`Strong Hook Score: ${strongHookRes.score}/100`);
console.log(`- hasQuestion: ${strongHookRes.hasQuestion}`);
console.log(`- hasDirectAddress: ${strongHookRes.hasDirectAddress}`);
console.log(`- hasPowerWords: ${strongHookRes.hasPowerWords} (${strongHookRes.powerWordsFound.join(', ')})`);
console.log(`- hasNumbers: ${strongHookRes.hasNumbers}`);

assert.ok(strongHookRes.score >= 85, 'Strong hook should score >= 85');
assert.strictEqual(strongHookRes.hasQuestion, true);
assert.strictEqual(strongHookRes.hasDirectAddress, true);
assert.strictEqual(strongHookRes.hasPowerWords, true);
assert.strictEqual(strongHookRes.hasNumbers, true);
console.log('✓ Strong hook evaluation passed');

// 1.2 Weak / Empty Hook
const emptyHookRes = calculateHookStrength('');
assert.ok(emptyHookRes.score >= 0 && emptyHookRes.score <= 50, 'Empty hook should have low score');
assert.strictEqual(emptyHookRes.hasQuestion, false);
console.log('✓ Empty hook evaluation passed');

// 1.3 Overly long hook (>20 words)
const longHook = 'Hari ini saya akan menceritakan kisah yang sangat panjang tentang perjalanan hidup saya yang dimulai pada tahun sembilan belas sembilan puluh delapan di sebuah desa kecil.';
const longHookRes = calculateHookStrength(longHook);
assert.ok(longHookRes.brevityScore <= 60, 'Long hook should have lower brevity score');
console.log('✓ Long hook penalty passed\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Speech Pacing / WPM Calculation
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 2: Speech Pacing & WPM Engine ---');

// 2.1 Optimal Shorts tempo (150 WPM -> 75 words in 30 seconds)
const optimalPacing = calculateSpeechPacing({
  duration: 30,
  words: Array.from({ length: 75 }, (_, i) => ({
    word: `word${i}`,
    start: (i * 30) / 75,
    end: ((i + 1) * 30) / 75,
  })),
});
console.log(`Optimal Pacing: ${optimalPacing.wpm} WPM -> Score: ${optimalPacing.score}/100 (${optimalPacing.tempoStatus})`);
assert.strictEqual(optimalPacing.wpm, 150);
assert.ok(optimalPacing.score >= 90, '150 WPM should score >= 90 in Shorts sweet spot');
assert.strictEqual(optimalPacing.tempoStatus, 'Optimal Tempo');
console.log('✓ Optimal pacing evaluation passed');

// 2.2 Very slow pacing (60 WPM -> 20 words in 20 seconds)
const slowPacing = calculateSpeechPacing({
  duration: 20,
  text: 'Ini adalah kalimat yang diucapkan dengan sangat santai dan lambat sekali.',
});
console.log(`Slow Pacing: ${slowPacing.wpm} WPM -> Score: ${slowPacing.score}/100 (${slowPacing.tempoStatus})`);
assert.ok(slowPacing.score <= 75, 'Slow pacing should score <= 75');
assert.ok(slowPacing.wpm < 100, 'WPM should be slow');
console.log('✓ Slow pacing evaluation passed');

// 2.3 Pauses penalty detection
const wordsWithPauses = [
  { word: 'Pertama', start: 0, end: 0.5 },
  { word: 'kedua', start: 2.5, end: 3.0 }, // 2.0s gap
  { word: 'ketiga', start: 5.5, end: 6.0 }, // 2.5s gap
];
const pausePacing = calculateSpeechPacing({ duration: 10, words: wordsWithPauses });
assert.ok(pausePacing.pauseCount >= 2, 'Should detect pause count');
assert.ok(pausePacing.pausePenalty > 0, 'Should apply pause penalty');
console.log('✓ Pause penalty detection passed');

// 2.4 Empty speech (0 words)
const emptySpeech = calculateSpeechPacing({ duration: 10, text: '' });
assert.strictEqual(emptySpeech.wpm, 0);
assert.strictEqual(emptySpeech.tempoStatus, 'No Speech Detected');
console.log('✓ Empty speech detection passed\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Emotional Trigger & Retention Engine
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 3: Emotional Trigger & Retention Engine ---');

const emotionalText = 'Gila! Ini rahasia terbongkar yang bikin shock! Ternyata kamu bisa profit 10x lipat!';
const emotionRes = calculateEmotionalTrigger(emotionalText);
console.log(`Dominant Emotion: ${emotionRes.dominantEmotion} (${emotionRes.dominantEmotionEmoji})`);
console.log(`Emotional Score: ${emotionRes.score}/100`);
console.log(`Keywords Found: ${emotionRes.emotionalKeywords.join(', ')}`);

assert.ok(emotionRes.score >= 70, 'Emotional text should score >= 70');
assert.ok(emotionRes.emotionalKeywords.length >= 2, 'Should match emotional keywords');
assert.ok(emotionRes.emotionScores.curiosity >= 50, 'Curiosity score should be recorded');
console.log('✓ Emotional trigger evaluation passed\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Grade & Badge Categorization
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 4: Grade & Badge Categorization ---');

const gradeAplus = getViralityGrade(95);
assert.strictEqual(gradeAplus.grade, 'A+');
assert.strictEqual(gradeAplus.badge, 'High Viral Potential');
assert.strictEqual(gradeAplus.badgeEmoji, '🔥');

const gradeA = getViralityGrade(84);
assert.strictEqual(gradeA.grade, 'A');
assert.strictEqual(gradeA.badge, 'Good Viral Potential');
assert.strictEqual(gradeA.badgeEmoji, '⚡');

const gradeB = getViralityGrade(72);
assert.strictEqual(gradeB.grade, 'B');
assert.strictEqual(gradeB.badge, 'Moderate Potential');
assert.strictEqual(gradeB.badgeEmoji, '💡');

const gradeC = getViralityGrade(50);
assert.strictEqual(gradeC.grade, 'C');
assert.strictEqual(gradeC.badge, 'Needs Optimization');
assert.strictEqual(gradeC.badgeEmoji, '⚠️');

console.log('✓ All Grade and Badge brackets correctly categorized\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Comprehensive Master calculateViralityScore
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 5: Master calculateViralityScore Function ---');

const sampleClip = {
  title: '3 Rahasia Algoritma YouTube Shorts',
  hook: 'Tahukah kamu 3 rahasia gila agar video Shorts kamu tembus 1 juta views?',
  caption: 'Banyak kreator pemula belum paham trik rahasia ini. Simak sampai habis agar video kamu FYP!',
  duration: 40,
  words: Array.from({ length: 100 }, (_, i) => ({
    word: `kata${i}`,
    start: (i * 40) / 100,
    end: ((i + 1) * 40) / 100,
  })),
};

const fullScore = calculateViralityScore(sampleClip);
console.log(`Overall Virality Score: ${fullScore.score}/100 [${fullScore.badgeEmoji} ${fullScore.gradeLabel} - ${fullScore.badge}]`);
console.log(`- Hook Strength: ${fullScore.breakdown.hookStrength.score} (Weighted: ${fullScore.breakdown.hookStrength.weightedScore})`);
console.log(`- Speech Pacing: ${fullScore.breakdown.speechPacing.score} (${fullScore.breakdown.speechPacing.wpm} WPM)`);
console.log(`- Emotion Trigger: ${fullScore.breakdown.emotionalTrigger.score} (${fullScore.breakdown.emotionalTrigger.dominantEmotion})`);
console.log(`- Optimization Tips (${fullScore.tips.length}):`);
fullScore.tips.forEach((tip, idx) => console.log(`  ${idx + 1}. ${tip}`));
console.log(`- Alternative AI Hooks (${fullScore.alternativeHooks.length}):`);
fullScore.alternativeHooks.forEach((alt, idx) => console.log(`  ${idx + 1}. [${alt.badge}] ${alt.hook}`));

assert.ok(fullScore.score >= 80, 'Full sample clip should score >= 80');
assert.strictEqual(typeof fullScore.score, 'number');
assert.ok(fullScore.tips.length >= 2, 'Should generate at least 2 optimization tips');
assert.strictEqual(fullScore.alternativeHooks.length, 3, 'Should generate 3 alternative viral hooks');
console.log('✓ Comprehensive Virality Calculation passed\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: English Language Hook & Alternative Generator
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 6: English Language Handling ---');

const englishClip = {
  title: 'Why you are losing money on crypto',
  hook: 'Did you know 90% of traders fail because of this 1 secret mistake?',
  duration: 30,
  words: Array.from({ length: 75 }, (_, i) => ({
    word: `w${i}`,
    start: (i * 30) / 75,
    end: ((i + 1) * 30) / 75,
  })),
};

const engScore = calculateViralityScore(englishClip);
console.log(`English Clip Score: ${engScore.score}/100 [${engScore.gradeLabel}]`);
assert.ok(engScore.score >= 85, 'English viral hook should score high');
assert.ok(engScore.alternativeHooks[0].hook.includes('Don\'t scroll') || engScore.alternativeHooks[0].hook.includes('truth'), 'English alternative hooks should be generated');
console.log('✓ English language handling passed\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Lexicon Token Isolation & Substring False-Positive Prevention
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 7: Lexicon Token Isolation & Edge Cases ---');

// "divisions" contains "vs", but should NOT match controversy keyword "vs"
const textWithDivisions = 'We learned about the three major divisions of history.';
const divisionsEmotion = calculateEmotionalTrigger(textWithDivisions);
assert.strictEqual(divisionsEmotion.emotionalKeywords.includes('vs'), false, 'Should NOT match vs inside divisions');

// "secuanto" should NOT match "cuan"
const nonCuanHook = calculateHookStrength('Langkah secuanto dalam hidup');
assert.strictEqual(nonCuanHook.powerWordsFound.includes('cuan'), false, 'Should NOT match cuan in secuanto');

// Direct string input to calculateViralityScore
const directStringScore = calculateViralityScore('Tahukah kamu 3 rahasia viral ini?');
assert.strictEqual(typeof directStringScore.score, 'number');
assert.ok(directStringScore.score > 0);

// Non-string inputs should not throw
assert.doesNotThrow(() => calculateHookStrength(12345));
assert.doesNotThrow(() => calculateHookStrength(null));
assert.doesNotThrow(() => calculateEmotionalTrigger(undefined));
assert.doesNotThrow(() => calculateViralityScore(null));

// CJK tokenization
const cjkTokens = tokenize('你好世界 3 tips');
assert.ok(cjkTokens.length >= 5, 'CJK characters should be tokenized');

console.log('✓ Lexicon isolation and edge case robustness passed\n');

console.log('🎉 ALL AI VIRALITY SCORE & HOOK ANALYZER TESTS PASSED SUCCESSFULLY! 100% PASS\n');
