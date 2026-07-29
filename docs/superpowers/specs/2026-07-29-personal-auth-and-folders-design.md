# Design Specification: Personal Authentication and Folders

## 1. Goal
To provide a private, single-user environment where the user can generate, save, and organize video clips into custom folders. This transforms the application from a stateless utility into a persistent personal clipping library.

## 2. Architecture & Data Flow
- **Authentication**: Single-password barrier. A Next.js Middleware (`middleware.js`) will intercept all routes except `/login` and `/api/auth`.
- **Database**: Local JSON storage (`data/db.json`). This ensures zero external dependencies and fast local operations.
- **Data Model**:
  ```json
  {
    "folders": [
      { "id": "uuid", "name": "Folder Name", "createdAt": "timestamp" }
    ],
    "clips": [
      { "id": "uuid", "folderId": "uuid", "title": "Clip Title", "videoPath": "/clips/...mp4", "createdAt": "timestamp" }
    ]
  }
  ```

## 3. User Interface (Editorial Brutalism)
1. **Login Page (`/login`)**:
   - A stark, high-contrast screen.
   - A single, massive input field for the password.
   - No "Forgot Password" or "Sign Up" links.
2. **Home Page (`/`)**:
   - Retains the current extraction form.
   - Adds a "Save to Folder" dropdown (fetches from `db.json`).
   - Adds a "Library" navigation link in the top right.
3. **Library Page (`/library`)**:
   - A sharp, grid-based layout displaying all folders.
   - A form/button to create a new folder.
4. **Folder View (`/library/[id]`)**:
   - Displays all clips belonging to the selected folder in a brutalist video gallery format.

## 4. Error Handling & Edge Cases
- **Missing DB File**: If `data/db.json` does not exist, the API should automatically create it with an empty structure.
- **Incorrect Password**: Standard 401 response with a stark error message on the UI.
- **Session Expiration**: Use a simple JWT or a secure HTTP-only cookie with a long expiration (e.g., 30 days) to avoid frequent logouts.

## 5. Ambiguity Resolution (Self-Review)
- *Scope*: This is strictly for a single admin user. No user roles or complex relational databases are required.
- *Secret Management*: The password will be stored in `.env.local` as `ADMIN_PASSWORD`.
