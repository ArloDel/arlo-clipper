# Spec Desain: Dual-Theme Editorial Minimalist Redesign (Arlo Clipper)

**Tanggal:** 2026-08-21  
**Status:** Approved  
**Topik:** UI/UX Redesign Arlo Clipper ke Tema Dual-Theme Minimalist (Light Default + Clean Dark)

---

## 1. Overview & Tujuan

Mengubah seluruh antarmuka visual Arlo Clipper dari tema dark-copper berat dengan glow blob dan heavy drop shadow menjadi **Dual-Theme Editorial Minimalist UI** yang bersih, fungsional, dan bertipografi kuat (terinspirasi dari platform editorial modern seperti Linear, Notion, dan Readcv).

### Target Utama:
1. **Light & Dark Theme Parity:** Light mode sebagai default dengan warm bone background (`#FBFBFA`), dan Clean Dark mode (`#0D0D0E`) yang bebas dari efek glow/neon berlebih.
2. **Hairline Structural Borders:** Menghapus drop shadow tebal, mengganti pembatas visual dengan garis tegas `1px solid var(--border-hairline)`.
3. **Typographic Hierarchy:** Memanfaatkan kontras `Geist Sans` untuk UI/Headings dan `Geist Mono` untuk metadata (durasi, tanggal, shortcut, kode).
4. **Bento Grid Architecture:** Layout terstruktur dengan macro-whitespace lega dan padding proporsional.
5. **No AI Clichés:** Menghapus blob glow ungu/oranye, emoji dekoratif, pill buttons raksasa, dan shadow berat.

---

## 2. Design Tokens (CSS Architecture)

Definisi token warna pada `app/globals.css`:

```css
:root {
  /* Light Theme (Default) */
  --bg-canvas: #FBFBFA;
  --bg-surface: #FFFFFF;
  --bg-subtle: #F4F4F2;
  --bg-input: #FFFFFF;

  --text-main: #111111;
  --text-sub: #6E6D6B;
  --text-faint: #9E9D9A;

  --border-hairline: #EAEAEA;
  --border-hover: #D1D1D0;
  --border-focus: #111111;

  --accent: #111111;
  --accent-hover: #2E2E2E;
  --accent-contrast: #FFFFFF;
  --accent-subtle: #F0F0EE;

  /* Muted Spot Pastels */
  --pastel-blue-bg: #E1F3FE;
  --pastel-blue-text: #1F6C9F;
  --pastel-green-bg: #EDF3EC;
  --pastel-green-text: #346538;
  --pastel-red-bg: #FDEBEC;
  --pastel-red-text: #9F2F2D;
  --pastel-yellow-bg: #FBF3DB;
  --pastel-yellow-text: #956400;

  /* Spatial & Geometry */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* Shadows (Ultra-diffuse) */
  --shadow-flat: none;
  --shadow-subtle: 0 1px 3px rgba(0, 0, 0, 0.04);

  /* Fonts */
  --font-sans: var(--font-geist-sans), system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), monospace;
}

[data-theme='dark'] {
  /* Clean Dark Theme */
  --bg-canvas: #0D0D0E;
  --bg-surface: #141416;
  --bg-subtle: #1C1C1F;
  --bg-input: #141416;

  --text-main: #EDEDED;
  --text-sub: #999999;
  --text-faint: #666666;

  --border-hairline: rgba(255, 255, 255, 0.08);
  --border-hover: rgba(255, 255, 255, 0.16);
  --border-focus: #FFFFFF;

  --accent: #FFFFFF;
  --accent-hover: #E0E0E0;
  --accent-contrast: #111111;
  --accent-subtle: rgba(255, 255, 255, 0.08);

  /* Dark-adapted Pastels */
  --pastel-blue-bg: rgba(31, 108, 159, 0.18);
  --pastel-blue-text: #7EC1EB;
  --pastel-green-bg: rgba(52, 101, 56, 0.18);
  --pastel-green-text: #8FD194;
  --pastel-red-bg: rgba(159, 47, 45, 0.18);
  --pastel-red-text: #F29391;
  --pastel-yellow-bg: rgba(149, 100, 0, 0.18);
  --pastel-yellow-text: #F5D380;
}
```

---

## 3. Komponen Bersama (Shared Components)

1. **Theme Toggle Component (`ThemeToggle.js`):**
   - Toggle icon minimal (Sun/Moon SVG mono).
   - Sinkronisasi dengan `localStorage` dan class/attribute `[data-theme]` pada `document.documentElement`.
   - Mencegah flicker pada saat hidrasi awal.

2. **Global Navigation Bar:**
   - Logo `[▶] Arlo Clipper` dengan font tebal (`700`), logo mark square `24px x 24px` flat.
   - Header border-bottom `1px solid var(--border-hairline)`.
   - Navlink `Library →` dan Theme Switcher di sudut kanan atas.

3. **Buttons & Inputs:**
   - Primary button: Background `var(--accent)`, teks `var(--accent-contrast)`, radius `var(--radius-sm)`, hover brightness/color shift, active micro-press `transform: scale(0.98)`.
   - Secondary / Ghost button: Border `1px solid var(--border-hairline)`, background transparan, hover `var(--bg-subtle)`.
   - Form inputs & selects: Border `1px solid var(--border-hairline)`, background `var(--bg-input)`, focus outline `2px solid var(--border-focus)`.

---

## 4. Spesifikasi Halaman

### A. Home Page (`app/page.js`, `app/page.module.css`)
- **Hero:**
  - Tagline dalam font mono (`Geist Mono`, uppercase, letter-spacing `0.06em`, teks `var(--text-sub)`).
  - Display headline besar (`clamp(2.5rem, 5vw, 4rem)`), letter-spacing `-0.035em`, leading `1.1`.
  - Subtitle maksimal 65 karakter untuk kenyamanan membaca.
- **URL Input Section:**
  - Input box datar dengan padding generous (`16px 20px`), background `var(--bg-surface)`, border hairline.
  - Platform hints: Tag kapsul minimalis bertuliskan `YouTube`, `Vimeo`, `Twitch`, `Facebook` dengan font mono dan status dot pastel.
- **Options Accordion:**
  - Panel bento flat tanpa backdrop-filter berlebihan.
  - Aspect ratio selector: Segmented control (`9:16 Mobile` vs `16:9 Desktop`) dengan border pemisah rapi.
  - Subtitle toggle: Switch slider flat monochrome.
  - Select font family, size, dan color picker clean.

### B. Editorial & Realtime Editor (`app/editorial/page.js`, `app/editorial/page.module.css`, `app/editorial/editor.module.css`)
- **Status Stepper (Processing State):**
  - Timeline minimal: Lingkaran status `10px` dengan border `1px solid var(--border-hairline)`, status aktif diisi `var(--accent)`.
  - Hapus spinner neon berputar, ganti indikator loading step monokromatik.
- **Editor Studio (Editing State):**
  - 2-Column Bento Grid:
    - *Kiri:* Video preview terbungkus card border `1px solid var(--border-hairline)`. Tab klip berbentuk segmented pill flat.
    - *Kanan:* Panel kontrol font subtitle, ukuran, warna, checkbox outline/shadow, dan animation selector dalam bento card terstruktur.
    - Tombol "Save to Library →" solid di bagian bawah panel kontrol.

### C. Library & Folder Detail (`app/library/page.js`, `app/library/library.module.css`, `app/library/[id]/page.js`)
- **Header:**
  - Navigasi breadcrumb `← Back`, Page title `My Library`, dan tombol mode `Select` outline.
- **Video Card Grid:**
  - Card flat `1px solid var(--border-hairline)` dengan border-radius `var(--radius-md)`.
  - Hapus background video blur backdrop ganda yang memberatkan performa rendering. Ganti dengan video player bersih ber-background `var(--bg-canvas)`.
  - Bagian info: Judul klip (truncate 1 baris), tanggal dibuat & durasi dalam `Geist Mono` (`font-variant-numeric: tabular-nums`).
  - Tombol hapus ikon sampah minimal monokromatik.
- **Select Mode & Floating Action Dock:**
  - Floating bar di bagian bawah layar: background `var(--bg-surface)` dengan border `1px solid var(--border-hairline)`, radius `var(--radius-lg)`, shadow subtle.
  - Tombol "Download ZIP" (solid) dan "Delete" (destructive pastel / red).
- **Pagination:**
  - Tombol Previous / Next outline flat + indikator `Page X of Y` dalam font mono.

### D. Login Page (`app/login/page.js`, `app/login/login.module.css`)
- Box auth di tengah layar dengan border `1px solid var(--border-hairline)`, padding `32px`, radius `var(--radius-lg)`.
- Hapus radial glow background.
- Error box dengan style pastel red badge (`--pastel-red-bg` dan `--pastel-red-text`).

---

## 5. Rencana Verifikasi & Uji

1. **Dual-Theme Verification:**
   - Cek kontras keterbacaan (WCAG AA) pada Light mode dan Dark mode di seluruh 4 halaman.
   - Verifikasi tidak ada kebocoran warna hardcoded (seperti warna oranye `#d97756` lama atau background gelap `#09090b` hardcoded).
2. **Interactivity & Responsiveness:**
   - Uji responsivitas pada mobile viewport (375px) dan desktop (1440px).
   - Pastikan toggle options, selection mode di library, dan realtime subtitle editor berfungsi normal tanpa error console.
3. **Build & Lint Check:**
   - Jalankan `npm run build` atau `npm run lint` untuk memastikan tidak ada sintaks rusak atau import yang hilang.
