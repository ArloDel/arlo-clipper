# Server-Side Pagination Design

**Goal:** Implement server-side pagination for the "My Library" page to improve performance and user experience when handling a large number of clips.

## Architecture & Data Flow

1. **Backend (`lib/db.js`):**
   - Introduce a new function `getPaginatedClips(page, limit)` that:
     - Sorts clips by `createdAt` descending.
     - Calculates the offset based on `page` and `limit`.
     - Returns an object containing the paginated `clips`, `totalPages`, `currentPage`, and `totalClips`.

2. **API Endpoint (`app/api/clips/route.js`):**
   - Update the `GET` handler to read `page` and `limit` query parameters from the request URL.
   - Use `page` (default 1) and `limit` (default 9 or 12).
   - Call `getPaginatedClips` instead of `getAllClips` and return the result.

3. **Frontend (`app/library/page.js`):**
   - Update state: add `currentPage` (default 1) and `totalPages` (default 1).
   - Update `fetchClips` to append `?page=${currentPage}&limit=9` to the API request.
   - Introduce a pagination UI component at the bottom of the grid, featuring "Previous" and "Next" buttons, along with page numbers (e.g., "Page 1 of 5").
   - Handle edge cases: disable "Previous" on page 1, disable "Next" on the last page.
   - Update deletion logic: when a clip is deleted, if the page becomes empty and it's not page 1, decrement the page, or simply re-fetch the current page to update the list correctly.

## UI Changes
- A new `.pagination` container at the bottom of the library grid.
- Styled buttons matching the Opus.pro dark premium theme (`--bg-surface`, `--text-primary`, `--accent` for active/hover states).

## Error Handling
- Invalid `page` or `limit` parameters in the API will fallback to defaults (1 and 9).
- Network errors during fetch will be handled by the existing `catch` block (console error + loading state reset).
