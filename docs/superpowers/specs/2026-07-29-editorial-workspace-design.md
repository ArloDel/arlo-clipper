# Design Specification: Editorial Workspace (Async AI Clipping)

## 1. Goal
To transform the application from a "black-box" magic generator into an interactive, professional Editorial Workspace. The user will be able to preview the original video, receive 3-5 AI-curated highlight suggestions in real-time, select the desired clips, apply styling, and execute the final rendering.

## 2. Architecture & Data Flow
The monolithic `/api/clip` pipeline is decoupled into two distinct phases:

### Phase A: Analysis (`/api/analyze`)
1. **Input**: YouTube URL.
2. **Process**: 
   - Downloads audio (using `ytdl-core`).
   - Uploads to Gemini 1.5 Pro.
   - Instructs Gemini to return a JSON array of 3-5 top highlight candidates (each containing `start_time`, `end_time`, `title`, and `reason`).
3. **Output**: JSON array of candidate clips.

### Phase B: Rendering (`/api/render`)
1. **Input**: Array of selected candidates, original video path, and subtitle preferences (font, size, color).
2. **Process**:
   - Downloads full video (if not already cached).
   - Generates subtitles via Groq/Whisper for the specific segments.
   - Runs FFmpeg to slice, crop, and burn subtitles for each selected clip.
   - Saves to `data/db.json` using the provided `folderId`.
3. **Output**: Array of rendered clip URLs.

## 3. User Interface (Editorial Brutalism)
- **Route**: `app/editorial/page.js`
- **Layout Split**:
  - **Main Display (Left, 70%)**: 
    - The original video player (YouTube iframe or native `<video>`).
    - Below the player: A "Rendered Output" gallery area that populates as FFMPEG finishes tasks.
  - **Sidebar (Right, 30%)**:
    - **Loading State**: Brutalist spinner "AI ANALYZING...".
    - **Analysis Results**: A checklist of 3-5 clips with their timestamps and titles.
    - **Global Settings**: Form for Font, Size, Color, and Folder Destination.
    - **Execution Button**: A massive "EXECUTE SELECTED" button.

## 4. Ambiguity Resolution (Self-Review)
- *Parallel Rendering*: FFMPEG is CPU intensive. If the user selects 5 clips and hits "EXECUTE", the backend will process them sequentially to avoid crashing the Node.js server or running out of memory.
- *Cache Management*: The original video is cached in `/public/clips/original-[id].mp4` during analysis/rendering so it doesn't need to be re-downloaded multiple times for the same session.
