# EPUB Admin Converter

A browser-based EPUB-to-text conversion admin panel with a panel-style UI, local-first processing, conversion history, and lightweight PWA/offline support.

## What this app does
- Uploads an `.epub` file in the browser.
- Extracts readable XHTML chapter text and concatenates it in spine order.
- Shows conversion metrics (chapters, chars, estimated TXT parts).
- Lets users copy extracted text, export as split TXT files in a ZIP, and clear current output.
- Persists recent conversion history in IndexedDB.
- Persists preferences (theme, max chars per part, separator style) in `localStorage`.
- Supports basic PWA install and offline fallback shell via service worker.

## Features
- Responsive admin-like dashboard layout.
- Mobile sidebar with overlay and proper focus handling.
- Paste-safe history UI with delete/clear actions.
- Robust-ish EPUB parsing:
  - Reads `META-INF/container.xml`
  - Resolves OPF package and spine
  - Loads XHTML/HTML chapter content from ZIP entries
  - Splits output by paragraphs for export
- Defensive coding for browser limits and runtime failures.

## Project files
- `index.html`
  - App shell, sidebar, converter controls, history table.
- `styles/app.css`
  - UI styling, responsive layout, light/dark themes.
- `scripts/app.js`
  - App behavior, event binding, workflow orchestration.
- `scripts/epubParser.js`
  - EPUB parsing and text extraction.
- `scripts/textSplitter.js`
  - Paragraph-aware text splitting and part estimation.
- `scripts/db.js`
  - IndexedDB access for conversion history.
- `scripts/storage.js`
  - `localStorage` preference persistence.
- `scripts/ui.js`
  - Toasts and formatting helpers.
- `sw.js`
  - Service worker caching and offline fallback.
- `manifest.webmanifest`, `offline.html`, `icons/`
  - PWA manifest, offline screen, icons.

## Run locally
1. Open a terminal in the repo root.
2. Start a local static server, for example:
   - `python -m http.server 8080`
   - then open `http://localhost:8080`.
3. Load an EPUB file from the converter section.
4. Optional: use Chrome/Edge install prompt for PWA behavior.

> The page loads JSZip from CDN. For offline-first use in production, consider bundling JSZip locally so parsing works fully without network.

## Data flow (high level)
1. User selects a file.
2. `app.js` calls `parseEpubToText(file)`.
3. `epubParser.js` reads the EPUB as ZIP, resolves package/spine, and extracts chapter text.
4. UI updates metrics and textarea output.
5. A conversion row is saved to IndexedDB by `addHistory`.
6. Export uses `textSplitter.js` + JSZip to generate `part_xx.txt` files.

## Persistence
- **IndexedDB**: conversion history (`scripts/db.js`)
- **localStorage**: UI preferences (`scripts/storage.js`)

## Review findings / known issues
1. `scripts/app.js` currently displays the file metadata in `updateMetrics()` and in some metric updates (e.g., maxChars change) uses content length for `fileSize` when no explicit file object size is available. This can show a byte count based on textarea length rather than original file size.
2. `scripts/app.js` sample text uses encoded characters in some strings (displayed as `â€`) when non-ASCII glyphs are embedded in source text.
3. `offline.html` notes that JSZip may not be cached; because JSZip is loaded from CDN, full conversion may fail offline unless a local vendored copy is added to the app shell.
4. Service worker fetch logic caches only `response.ok` responses, which is safe, but misses caching `opaque` successful third-party responses due CORS behavior.

## Suggested follow-ups
- Fix metadata logic to track and display real uploaded file byte size independent of current textarea content.
- Normalize all Unicode literals in sample text and UI strings.
- Add a locally hosted JSZip bundle to APP_SHELL for reliable offline conversion.
- Add lightweight buildless test snippets for parser edge cases (namespace-heavy OPF/container inputs).

## Browser behavior notes
- Requires a modern browser with `DOMParser`, `indexedDB`, `Promise`, and `cache` APIs.
- Works best with EPUB files around normal novel/book sizes; very large EPUBs may hit browser memory limits.