import assert from 'assert';
import { getYouTubeCopy, getInstagramCopy, getTikTokCopy, getAllCopies, formatHashtags } from '../lib/socialCopy.js';
import { saveClip, getAllClips, deleteClip } from '../lib/db.js';

console.log('🧪 Starting Social Metadata & Copy Formatter Tests...');

// 1. Test Hashtag Formatter
console.log('Test 1: Hashtag formatting');
const tags = ['shorts', '#viral', 'trending', '#podcast'];
const formattedTags = formatHashtags(tags);
assert.strictEqual(formattedTags, '#shorts #viral #trending #podcast');
console.log('✓ Hashtags formatted properly');

// 2. Test Platform Formatters
console.log('Test 2: Platform Copy Generators');
const sampleClip = {
  title: 'Rahasia Sukses di Usia Muda',
  hook: 'Jangan lakukan 3 kesalahan fatal ini di umur 20-an!',
  caption: 'Banyak orang tidak sadar bahwa kebiasaan kecil di usia muda menentukan masa depan.',
  channelName: 'Deddy Corbuzier',
  startTime: '00:01:15',
  endTime: '00:01:55',
  duration: 40,
  hashtags: ['#Shorts', '#Viral', '#Podcast', '#Sukses']
};

const ytCopy = getYouTubeCopy(sampleClip);
console.log('\n--- YouTube Copy Output ---');
console.log(ytCopy);
assert.ok(ytCopy.includes('Rahasia Sukses di Usia Muda'), 'Missing Title');
assert.ok(ytCopy.includes('Deddy Corbuzier'), 'Missing Channel Name');
assert.ok(ytCopy.includes('00:01:15 - 00:01:55'), 'Missing Timestamp');
assert.ok(ytCopy.includes('#YouTubeShorts'), 'Missing YouTube Tag');

const igCopy = getInstagramCopy(sampleClip);
console.log('\n--- Instagram Copy Output ---');
console.log(igCopy);
assert.ok(igCopy.includes('Jangan lakukan 3 kesalahan fatal ini di umur 20-an!'), 'Missing Hook');
assert.ok(igCopy.includes('@DeddyCorbuzier'), 'Missing IG Credit');
assert.ok(igCopy.includes('#Reels'), 'Missing Reels Tag');

const ttCopy = getTikTokCopy(sampleClip);
console.log('\n--- TikTok Copy Output ---');
console.log(ttCopy);
assert.ok(ttCopy.includes('cc: Deddy Corbuzier'), 'Missing TikTok Credit');
assert.ok(ttCopy.includes('#fyp'), 'Missing TikTok Tag');

const allCopies = getAllCopies(sampleClip);
assert.ok(allCopies.youtube && allCopies.instagram && allCopies.tiktok, 'Missing one of platform copies');
console.log('✓ All platform copy generators passed!');

// 3. Test Database Persistence
console.log('\nTest 3: Database Persistence of Social Metadata');
const testClipId = 'test-meta-' + Date.now();
const saved = saveClip({
  id: testClipId,
  title: 'Unit Test Clip',
  videoPath: '/clips/test.mp4',
  duration: 35,
  hook: 'Hook testing text',
  caption: 'Caption testing text',
  channelName: 'TestChannel',
  startTime: '00:00:10',
  endTime: '00:00:45',
  hashtags: ['#Test', '#Automated']
});

assert.strictEqual(saved.id, testClipId);
assert.strictEqual(saved.hook, 'Hook testing text');
assert.strictEqual(saved.channelName, 'TestChannel');
assert.strictEqual(saved.startTime, '00:00:10');
assert.strictEqual(saved.endTime, '00:00:45');
assert.deepStrictEqual(saved.hashtags, ['#Test', '#Automated']);

const allClips = getAllClips();
const found = allClips.find(c => c.id === testClipId);
assert.ok(found, 'Saved clip not found in DB');
assert.strictEqual(found.hook, 'Hook testing text');

// Clean up
deleteClip(testClipId);
console.log('✓ Database persistence verified and test clip cleaned up!');

console.log('\n🎉 ALL SOCIAL METADATA AUTOMATION TESTS PASSED SUCCESSFULLY!');
