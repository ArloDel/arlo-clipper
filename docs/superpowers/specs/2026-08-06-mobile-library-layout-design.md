# Mobile-Oriented Library Layout (Blurred Backdrop Design)

**Goal:** Redesign the Library clip cards to follow a uniform vertical mobile aspect ratio (9:16). When a desktop video (16:9) is displayed within these vertical cards, it should not be cropped. Instead, it should fit in the center with a premium blurred backdrop filling the empty vertical space.

## Architecture & Visual Strategy

1. **Uniform Aspect Ratio:**
   - Modify the CSS for `.videoWrapper` in the library page to enforce an `aspect-ratio: 9 / 16`.
   - This ensures all cards are tall and uniformly aligned in the grid, maximizing the layout for mobile/viral clip aesthetics.

2. **Video Object-Fit:**
   - Change `.video` inside the wrapper to use `object-fit: contain`. 
   - This ensures that a 16:9 desktop video will fit entirely inside the 9:16 container without its left/right edges being chopped off.

3. **Blurred Backdrop (Glassmorphism):**
   - We will implement a visual trick to create a blurred version of the video behind the main video.
   - Because standard `<video>` elements don't inherently allow a duplicate background blur without double-rendering (which hurts performance), we can use a CSS technique: adding a dynamic pseudo-element or duplicating the video in the DOM but strictly for the backdrop.
   - Actually, a highly efficient CSS-only trick for this is applying `backdrop-filter: blur(20px)` on a container that overlays a scaled-up, absolute-positioned duplicate of the video, OR simply styling the `.videoWrapper` to be dark and layering the video twice in React.
   - **React Implementation:** In `app/library/page.js`, inside `.videoWrapper`, we will render the video twice:
     1. **Backdrop Video:** `absolute` positioned, `object-fit: cover`, scaled up, with `filter: blur(20px) brightness(0.6)`. Muted and non-interactive.
     2. **Foreground Video:** `relative` positioned, `object-fit: contain`. The interactive player.

## Implementation Details
- Target files: `app/library/page.js` and `app/library/library.module.css`.
- In `page.js`: Add a second `<video>` element per card for the backdrop.
- In `library.module.css`: Add CSS classes `.videoBackdrop` and update `.videoWrapper`.
