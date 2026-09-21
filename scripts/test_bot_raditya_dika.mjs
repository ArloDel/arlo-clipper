import fs from 'fs';
import path from 'path';

// Load environment variables
if (fs.existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}

import {
  resolveChannelInfo,
  saveBotConfig,
  getBotConfig,
  getBotHistory,
  checkAndProcessNewVideos,
} from '../lib/localBot.js';
import { getAllClips } from '../lib/db.js';

console.log('================================================================================');
console.log('🤖 MENJALANKAN AUTOMATION BOT DENGAN CHANNEL RADITYA DIKA');
console.log('================================================================================\n');

async function main() {
  console.log('[STEP 1] Menghubungi dan menganalisis channel YouTube @RadityaDika...');
  const channelData = await resolveChannelInfo('https://www.youtube.com/@RadityaDika');

  console.log(`✓ Channel Ditemukan: ${channelData.channelName} (${channelData.channelId})`);
  console.log(`  Total video terbaru di feed: ${channelData.videos?.length || 0}`);

  if (!channelData.videos || channelData.videos.length === 0) {
    throw new Error('Tidak ada video yang ditemukan di feed channel Raditya Dika.');
  }

  const latestVideo = channelData.videos[0];
  console.log('\n[STEP 2] Video Sumber Terbaru yang Dipilih:');
  console.log(`  - Judul       : ${latestVideo.title}`);
  console.log(`  - Video ID    : ${latestVideo.videoId}`);
  console.log(`  - URL         : ${latestVideo.url}`);
  console.log(`  - PublishedAt : ${latestVideo.publishedAt}`);

  // Simpan konfigurasi bot dengan 3 klip per video & preset karaoke
  saveBotConfig({
    enabled: true,
    channelUrl: 'https://www.youtube.com/@RadityaDika',
    channelId: channelData.channelId,
    channelName: channelData.channelName,
    checkIntervalMinutes: 1440,
    maxVideosPerCheck: 1,
    maxClipsPerVideo: 3,
    preset: {
      ratio: '9:16',
      faceTracking: false,
      splitScreen: false,
      subtitles: true,
      subtitleAnimation: 'Karaoke',
      font: 'Impact',
      fontSize: 'Medium',
      color: '#FFFF00',
      broll: 'auto',
      bgm: 'chill-lofi',
      ducking: 'medium',
      sfx: true,
    },
    exportSettings: {
      autoExport: true,
      exportDir: 'exports',
      generateTxtMetadata: true,
      generateJsonMetadata: true,
    },
  }, { restartScheduler: false });

  console.log('\n[STEP 3] Memulai Pipeline AI Otomatis (Download -> Whisper -> AI Highlight -> Karaoke Subtitles & BGM -> 3 Klip Render)...');
  console.log('⏳ Proses ini memerlukan waktu beberapa menit untuk mendownload, mentranskripsi, dan merender 3 video MP4 1080p...\n');

  // Trigger processing for the target video
  const result = await checkAndProcessNewVideos({
    isManual: true,
    forceVideoUrl: latestVideo.url,
  });

  console.log('\n[STEP 4] Hasil Eksekusi Bot Otomatis:');
  console.log(`  - Status Sukses    : ${result.success}`);
  console.log(`  - Jumlah Diproses  : ${result.processedCount || result.results?.length || 0}`);
  console.log(`  - Total Waktu (ms) : ${result.durationMs || 0} ms`);

  if (result.results && result.results.length > 0) {
    const jobResult = result.results[0];
    console.log(`\n  🎬 Video: ${jobResult.videoTitle}`);
    console.log(`  📁 Export Folder: ${jobResult.exportFolder}`);
    console.log(`  ✨ Total Klip Dihasilkan: ${jobResult.clipCount || jobResult.clips?.length || 0}`);

    if (Array.isArray(jobResult.clips)) {
      jobResult.clips.forEach((clip, i) => {
        console.log(`\n  --------------------------------------------------`);
        console.log(`  📌 KLIP #${i + 1}: ${clip.title}`);
        console.log(`  🔥 Viral Hook  : ${clip.hook}`);
        console.log(`  ⏱️  Durasi      : ${Math.round(clip.duration || 0)} detik (${clip.startTime} - ${clip.endTime})`);
        console.log(`  🎥 Video File  : ${clip.videoUrl || clip.videoPath}`);
        console.log(`  🏷️  Hashtags    : ${Array.isArray(clip.hashtags) ? clip.hashtags.join(' ') : clip.hashtags}`);
        if (clip.exportedMp4Path) console.log(`  💾 Exported MP4: ${clip.exportedMp4Path}`);
        if (clip.exportedTxtPath) console.log(`  📄 Metadata TXT: ${clip.exportedTxtPath}`);
      });
    }
  }

  console.log('\n================================================================================');
  console.log('🎉 BOT OTOMASI BERHASIL MEMPROSES 3 KLIP VIDEO DARI RADITYA DIKA!');
  console.log('================================================================================');
}

main().catch((err) => {
  console.error('\n❌ Terjadi kesalahan saat eksekusi bot:', err);
  process.exit(1);
});
