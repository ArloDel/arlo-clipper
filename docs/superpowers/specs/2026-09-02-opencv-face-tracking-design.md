# OpenCV Face Tracking & Smart Auto-Crop Design

## Overview
Menambahkan fitur Smart Auto-Crop / Face Tracking berbasis OpenCV dengan toggle switch pada panel kontrol Editor (`app/editorial/page.js`). Fitur ini melacak pergerakan wajah pembicara dalam video 16:9 dan menghasilkan crop vertikal 9:16 yang dinamis dan halus (smoothed), memastikan wajah pembicara tetap berada di tengah frame.

## Architecture & Data Flow

1. **Python Tracking Script (`scripts/track_face.py`)**:
   - Menerima path video input, rasio target (9:16), dan path output.
   - Menggunakan `cv2.CascadeClassifier` (Haar Cascade) atau `cv2.dnn` untuk deteksi wajah per frame/keyframe.
   - Menerapkan smoothing (Exponential Moving Average / Box filter) pada posisi X pusat wajah untuk menghindari jitter/kamera patah-patah.
   - Menghasilkan video yang di-crop terpusat pada wajah atau mengembalikan metadata crop interval.

2. **API Endpoint (`app/api/face-track/route.js`)**:
   - Endpoint Next.js untuk mengeksekusi skrip pelacakan wajah pada klip yang dipilih ketika user mengaktifkan toggle face tracking di editor.
   - Mengganti video path aktif dengan video hasil tracking, atau menyimpan state `faceTracking: true` pada metadata klip.

3. **Editor UI (`app/editorial/page.js` & `app/editorial/editor.module.css`)**:
   - Menambahkan toggle UI: "Auto Face Tracking (OpenCV)" di bawah subtitle settings.
   - Switch aktif per-klip. Jika diaktifkan, preview video beralih ke video dengan framing wajah terpusat.

4. **Final Render Pipeline (`app/api/render-final/route.js`)**:
   - Mempertahankan video hasil face-tracking saat melakukan pembakaran subtitle animasi dan penyimpanan final ke Library.

## Error Handling & Fallback
- Jika video tidak memiliki wajah (misal gameplay/landscape), otomatis fallback ke standard center-crop 9:16 tanpa crash.
- Eksekusi Python ditangani dengan timeout dan error capture yang aman.
