# Social Media Metadata Automation Design

## Overview
Menambahkan otomasi pembuatan metadata video sosial media (viral hook, caption, nama channel credit, timestamp/detik video, dan tagar/hashtags) untuk setiap klip yang dihasilkan oleh AI, serta integrasi tombol 1-klik salin terformat khusus untuk **YouTube Shorts**, **Instagram Reels**, dan **TikTok** pada halaman Editor dan Library.

## Architecture & Data Flow

### 1. AI Analysis & Channel Extraction (`app/api/analyze/route.js`)
- Mengambil metadata channel YouTube (`uploader` / `channel`) via `youtubedl` metadata extractor atau fallback cerdas.
- Menginstruksikan LLM (Google Gemini / Groq) untuk menganalisis transkrip dan menghasilkan data terstruktur:
  - `title`: Judul klip.
  - `hook`: Kalimat pembuka 1-baris yang kuat dan memikat (3 detik pertama).
  - `caption`: Deskripsi ringkas isi klip yang menarik audiens.
  - `channel_name`: Nama channel/kreator sumber.
  - `start_time` & `end_time`: Timestamp awal dan akhir (misal `00:01:20` - `00:02:00`).
  - `duration_sec`: Durasi klip dalam detik.
  - `hashtags`: Array tagar viral yang relevan (`#Shorts`, `#Reels`, `#TikTok`, `#Viral`, `#Trending`, dll).
  - Bahasa hook & caption otomatis menyesuaikan bahasa transkrip video.

### 2. Pipeline Propagation (`app/api/prepare-editor/route.js` & `app/api/render-final/route.js`)
- Menyertakan objek metadata lengkap pada setiap item di `processedClips`.
- Menyimpan metadata ke database lokal (`data/db.json` via `lib/db.js`) saat proses render final selesai.

### 3. Formatting Helper (`lib/socialCopy.js`)
Modul pembantu untuk menghasilkan template teks siap upload:
- **YouTube Shorts**:
  ```text
  [Hook / Title]

  [Caption]

  📍 Source: [Channel Name] (Clip: [StartTime] - [EndTime])

  [Hashtags]
  ```
- **Instagram Reels**:
  ```text
  [Hook]

  [Caption]
  .
  .
  🎥 Credit: @[Channel Name] | ⏱️ [StartTime] - [EndTime]

  [Hashtags]
  ```
- **TikTok**:
  ```text
  [Hook] 🔥

  [Caption]

  cc: [Channel Name] [Hashtags]
  ```

### 4. UI Implementation
- **Editor Studio (`app/editorial/page.js`)**: Panel "Social Media Copy (AI)" interaktif dengan preview teks dan tombol 1-klik salin platform dengan visual toast "Tersalin!".
- **Library (`app/library/page.js`)**: Tombol modal/drawer "Social Copy" pada setiap kartu klip di perpustakaan.
