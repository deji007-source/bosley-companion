# Bosley Companion

Browser-first prototype for a compact, dark Bosley assistant panel.

## Included
- Dark companion panel with collapsible orb mode
- Text input and local-only demo responses
- Optional browser speech synthesis for spoken replies
- Optional browser speech recognition where supported
- Visible AI-disconnected state
- In-page shortcut: `Ctrl + Shift + B` or `Alt + Shift + B`

## Important limitations
- This is a UI prototype, not a connected AI assistant.
- Messages are not sent to an AI service or saved to a database.
- Browser speech recognition varies by browser and may rely on the browser vendor's service; it is not guaranteed to be fully offline.
- The shortcut only works while this page is open and the browser tab has keyboard focus. A future Windows desktop build can add a global shortcut.
- Do not add API keys, passwords, Supabase service-role keys, or other secrets to this public repository.

## Run locally
Install Node.js LTS, then from this folder:
```bash
npm install
npm run dev
```
Open the local URL printed by Vite.

## Build
```bash
npm run build
```
Production output is created in `dist/`, ready for Vercel.

## Deploy to Vercel
Import this GitHub repository in Vercel. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`. No environment variables are required for this prototype.
