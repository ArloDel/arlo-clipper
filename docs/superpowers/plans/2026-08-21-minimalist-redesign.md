# Minimalist Dual-Theme Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign seluruh antarmuka web Arlo Clipper (Home, Editor, Library, Login) menjadi Dual-Theme Editorial Minimalist UI (Light default + Clean Dark) dengan hairline borders `1px`, tipografi tajam, bento-grid, dan tanpa AI glow/heavy shadows.

**Architecture:** Menerapkan CSS Variables token-driven (`globals.css`) dengan atribut `[data-theme='dark']` dan `ThemeToggle` component di header. Memperbarui styling CSS Modules di setiap halaman agar modular, performan, dan responsif.

**Tech Stack:** Next.js 16 (App Router), React 19, CSS Modules, Geist Font (`GeistSans`, `GeistMono`).

## Global Constraints

- Gunakan `var(--font-geist-sans)` untuk UI/Headings dan `var(--font-geist-mono)` untuk metadata/stats.
- Semua card dan input menggunakan `border: 1px solid var(--border-hairline)`.
- Hapus semua radial glow background, heavy drop shadows, dan elemen gradient ungu/oranye.
- Tidak mengubah API backend atau alur bisnis yang sudah berjalan (transkripsi, render ffmpeg, dsb).

---

### Task 1: Design Tokens & Theme Toggle Architecture

**Files:**
- Create: `app/components/ThemeToggle.js`
- Create: `app/components/ThemeToggle.module.css`
- Modify: `app/globals.css`
- Modify: `app/layout.js`

**Interfaces:**
- Produces: `ThemeToggle` component, CSS tokens (`--bg-canvas`, `--bg-surface`, `--text-main`, `--border-hairline`, `--accent`, etc.)

- [ ] **Step 1: Update `app/globals.css` with complete Dual-Theme token architecture**
  Define light mode default tokens (`#FBFBFA` canvas, `#FFFFFF` surface, `#111111` text & accent) and `[data-theme='dark']` tokens (`#0D0D0E` canvas, `#141416` surface, `#EDEDED` text, `#FFFFFF` accent). Remove noise pseudo-element glow and dark-copper hardcodes.

- [ ] **Step 2: Create `app/components/ThemeToggle.js` & `ThemeToggle.module.css`**
  Build a clean, hydration-safe theme switcher button using Sun and Moon minimal SVGs. Sync state with `localStorage` and `document.documentElement.setAttribute('data-theme', theme)`.

- [ ] **Step 3: Update `app/layout.js` to include theme initialization script**
  Inject a small inline script before children to prevent theme flash on load, and verify font variable bindings.

- [ ] **Step 4: Verify tokens and theme toggle in dev server**
  Check that toggling theme sets `data-theme="dark"` on `<html>` and changes background and text colors cleanly.

---

### Task 2: Redesign Home Page & Options Form

**Files:**
- Modify: `app/page.js`
- Modify: `app/page.module.css`

**Interfaces:**
- Consumes: CSS tokens from Task 1, `ThemeToggle` component.

- [ ] **Step 1: Update `app/page.js` Header & Hero**
  Integrate `ThemeToggle` in the top-right header alongside `My Library →`. Refine tagline to use `GeistMono` text, headline to high-contrast typography, and remove the `.glow` element.

- [ ] **Step 2: Refactor URL input and platform badges in `app/page.module.css`**
  Style the URL input with `1px solid var(--border-hairline)`, clean focus ring, and monospace platform indicator tags (`YT`, `Vimeo`, `Twitch`, `Facebook`).

- [ ] **Step 3: Redesign options panel and segmented ratio controls**
  Convert the options container into a flat bento box. Style aspect ratio buttons as a segmented control, switch toggle as a flat slider, and select inputs with crisp hairline borders.

- [ ] **Step 4: Style submit CTA button**
  Primary CTA with solid `var(--accent)`, crisp `6px` radius, and subtle active press interaction `transform: scale(0.98)`.

---

### Task 3: Redesign Processing Stepper & Realtime Subtitle Editor

**Files:**
- Modify: `app/editorial/page.js`
- Modify: `app/editorial/page.module.css`
- Modify: `app/editorial/editor.module.css`

**Interfaces:**
- Consumes: Dual-theme CSS variables.

- [ ] **Step 1: Redesign Processing Stepper View in `page.module.css`**
  Create a minimalist vertical/horizontal stepper with clean `10px` indicator dots, thin `1px` connector lines, and subtle pastel status badges. Remove neon pulsing spinners.

- [ ] **Step 2: Redesign EditorStudio 2-Column Bento in `editor.module.css`**
  - Left preview section: Video player container bounded by `1px solid var(--border-hairline)` with segmented clip tabs.
  - Right controls section: Clean bento card with subtitle typography controls (font, size, color picker, outline/shadow toggles, animation dropdown).

- [ ] **Step 3: Update `app/editorial/page.js` component markup**
  Clean up header and button hierarchy to match the new minimalist theme.

---

### Task 4: Redesign Library & Folder Pages

**Files:**
- Modify: `app/library/page.js`
- Modify: `app/library/library.module.css`
- Modify: `app/library/[id]/page.js`
- Modify: `app/library/[id]/folder.module.css`

**Interfaces:**
- Consumes: CSS variables, monospace font for timestamps.

- [ ] **Step 1: Redesign Library Header & Grid in `library.module.css`**
  - Header: Back button `←`, Title, and `Select` toggle button in outline style.
  - Grid: Video cards with `border: 1px solid var(--border-hairline)`, crisp radius `8px`. Remove the heavy blurred video backdrop element to optimize rendering and visual cleanliness.

- [ ] **Step 2: Style clip metadata and selection controls**
  Format duration and date in `GeistMono` (`tabular-nums`). Style checkbox indicators and card selection border.

- [ ] **Step 3: Redesign floating action dock and pagination**
  Floating dock at the bottom: background `var(--bg-surface)`, border `1px solid var(--border-hairline)`, clean buttons for "Download ZIP" and "Delete". Pagination with outline buttons and monospace page counter.

- [ ] **Step 4: Update `app/library/[id]/page.js` and `folder.module.css`**
  Replace obsolete `@cloudflare/kumo` classes with project-standard CSS tokens.

---

### Task 5: Redesign Login Page

**Files:**
- Modify: `app/login/page.js`
- Modify: `app/login/login.module.css`

**Interfaces:**
- Consumes: CSS variables.

- [ ] **Step 1: Update `login.module.css` layout and card styling**
  Remove `.backgroundGlow`. Center the login card with `border: 1px solid var(--border-hairline)`, padding `32px`, and radius `var(--radius-lg)`.

- [ ] **Step 2: Update form inputs, error alert, and submit button**
  Password input with clean focus ring, error alert styled with `--pastel-red-bg` and `--pastel-red-text`, and solid primary button.

---

### Task 6: Verification, Lint & Build

**Files:**
- All touched files.

- [ ] **Step 1: Run Next.js lint check**
  Run `npm run lint` and fix any linting or formatting issues.

- [ ] **Step 2: Run Next.js build test**
  Run `npm run build` to verify there are no server-side rendering or CSS module syntax errors.

- [ ] **Step 3: Visual & functional check across all routes**
  Verify `/`, `/editorial`, `/library`, `/library/[id]`, and `/login` in both Light and Dark modes.
