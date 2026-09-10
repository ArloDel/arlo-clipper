# Lip Tracking (Active Speaker Detection) Design

## Overview
Menambahkan fitur **Lip Tracking / Active Speaker Detection** berbasis OpenCV untuk secara cerdas mengidentifikasi pembicara aktif dalam video (misal video podcast, wawancara, debat multi-orang) melalui deteksi gerakan bibir (lip motion energy) dan memfokuskan kamera 9:16 secara otomatis ke orang yang sedang berbicara.

---

## 1. Algoritma Lip Motion Tracking (`scripts/track_lip.py`)
1. **Multi-Face Detection**:
   - Menggunakan Haar Cascade frontal face dan profile face untuk mendeteksi semua wajah dalam frame.
2. **Mouth ROI Extraction**:
   - Untuk setiap wajah `(x, y, w, h)`, area mulut diekstrak dari sepertiga bawah wajah:
     - `mouth_y = y + int(0.65 * h)`
     - `mouth_h = int(0.35 * h)`
     - `mouth_x = x + int(0.20 * w)`
     - `mouth_w = int(0.60 * w)`
3. **Speech Activity Metric**:
   - Rescale mouth ROI ke ukuran seragam (64x48) dan konversi ke grayscale.
   - Hitung selisih intensitas piksel temporal (*temporal frame difference*) terhadap frame sebelumnya:
     `diff = cv2.absdiff(curr_mouth, prev_mouth)`
     `lip_motion = np.mean(diff)`
   - Perbarui skor keaktifan pembicara dengan pembobotan peluruhan eksponensial (*exponential decay*):
     `activity = activity * 0.85 + lip_motion * 0.15`
4. **Active Speaker Selection & Camera Movement**:
   - Memilih wajah dengan skor gerakan bibir tertinggi sebagai target fokus.
   - Menerapkan perataan pergerakan kamera (*Exponential Moving Average - EMA*) dengan `alpha = 0.06` untuk perpindahan framing yang halus dan sinematik saat pembicara berganti.
   - Memastikan buffer memori `np.ascontiguousarray` untuk kompatibilitas Windows Media Foundation.
   - Remuxing audio original menggunakan FFmpeg.

---

## 2. API Endpoint (`app/api/lip-track/route.js`)
- Input: `{ clipId, sourceVideoPath, videoPath, ratio }`
- Output: `{ success: true, trackedVideoPath: '/clips/{clipId}-liptracked.mp4', activeSpeakerSwitches: count }`
- Caching: Jika file `{clipId}-liptracked.mp4` sudah ada, langsung kembalikan path cache.

---

## 3. UI Editorial Studio (`app/editorial/page.js` & CSS)
- Menambahkan mode toggle atau radio pill di Editor Studio:
  - 👤 **Face Tracking**
  - 👄 **Lip Tracking (Active Speaker)**
- Menampilkan status loading saat OpenCV memproses lip tracking dan langsung beralih ke video hasil tracking.
