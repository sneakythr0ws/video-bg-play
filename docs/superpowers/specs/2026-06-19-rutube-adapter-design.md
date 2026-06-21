# Design: Rutube adapter for video-bg-play

## Goal

Extend the existing Firefox add-on so that it correctly keeps videos playing in the background on `rutube.ru`, without breaking core Rutube functionality and without rewriting the existing codebase.

## Current state

- Single content script: `video-bg-play-content.js`.
- Supports: `youtube.com`, `youtube-nocookie.com`, `vimeo.com`.
- Uses Firefox `document.wrappedJSObject` to override Page Visibility API.
- YouTube-specific: simulated keypresses to defeat inactivity timers.
- Vimeo-specific: blocks `fullscreenchange` events.
- No adapter abstraction, no diagnostics, no SPA route-change handling.

## Decision log

| Question | Decision | Reason |
|---|---|---|
| Adapter scope | Rutube-only adapter | Minimal-invasive; existing YouTube/Vimeo logic stays in place |
| Architecture | `core/patches.js` + `adapters/rutube.js` + bootstrap for YouTube/Vimeo | Avoids code duplication, keeps platform logic isolated |
| Embed/iframe support | Only main `rutube.ru` domain | Simpler scope; embed support can be added later if needed |
| DEBUG flag | Hardcoded constant in adapter | Simplest, no manifest permission changes required |
| IntersectionObserver | Wrap constructor, spoof only video/player targets | Prevents global breakage while defeating viewport checks |

## Architecture

```
video-bg-play/
├── core/
│   └── patches.js              # shared Page Visibility API patches
├── adapters/
│   └── rutube.js               # Rutube-specific adapter
├── video-bg-play-content.js    # bootstrap for YouTube/Vimeo
└── manifest.json               # updated content_scripts
```

## Components

### `core/patches.js`

Provides `window.VideoBgPlayCore.patchPageVisibility(overrideProps)`.

- Always adds a capturing `visibilitychange` listener that calls `stopImmediatePropagation()`.
- When `overrideProps` is `true`, overrides `document.hidden` and `document.visibilityState` via `document.wrappedJSObject`.
- Exports the helper on `window.VideoBgPlayCore` so that multiple content-script files can share it.

### `adapters/rutube.js`

Platform adapter for `rutube.ru`.

1. Apply `VideoBgPlayCore.patchPageVisibility(true)`.
2. Block focus/blur/pagehide/freeze events via capturing listeners.
3. Wrap `IntersectionObserver` so that video/player targets appear always visible.
4. Guard `fullscreenchange` if Rutube uses it to stop playback (with TODO for verification).
5. Observe DOM dynamically for `<video>`, player containers, and Rutube iframes.
6. Re-initialize on SPA route changes (`popstate`, `hashchange`, patched `history.pushState`/`replaceState`).
7. Diagnostic logging gated by `const DEBUG = false` with prefix `[video-bg-play][rutube]`.

### `video-bg-play-content.js`

Stays the bootstrap for YouTube/Vimeo. Changes:

- Remove the generic Page Visibility property/event patches (now in `core/patches.js`).
- Call `VideoBgPlayCore.patchPageVisibility(IS_ANDROID || !IS_DESKTOP_YOUTUBE)`.
- Keep YouTube activity loop and Vimeo fullscreen block unchanged.

### `manifest.json`

Two content script entries:

1. YouTube/Vimeo: `core/patches.js`, `video-bg-play-content.js`.
2. Rutube: `core/patches.js`, `adapters/rutube.js`.

Both keep `all_frames: true`.

## Data flow / lifecycle

1. Extension injects `core/patches.js` first on matched sites.
2. For Rutube sites, `adapters/rutube.js` runs next and applies platform-specific patches + dynamic observers.
3. For YouTube/Vimeo, `video-bg-play-content.js` runs next and applies platform-specific patches.
4. On Rutube SPA navigation, adapter re-runs initialization; previous observers are disconnected first.
5. On page unload, all observers/listeners clean up automatically with the content script context.

## Error handling

- All event listeners use capturing phase and `stopImmediatePropagation`.
- IntersectionObserver wrapper falls back gracefully if the original constructor is unavailable.
- Adapter errors are caught and logged with the `[video-bg-play][rutube]` prefix.
- Observers are disconnected before re-initialization on route change.

## Testing

- Manual Rutube checks: background tab, screen lock, app switching, SPA navigation between videos.
- Regression checks on YouTube (mobile/desktop) and Vimeo: background playback, fullscreen exit.
- `npm run check` for lint, format, and web-ext validation.

## Risks

- `document.wrappedJSObject` is Firefox-only; Chromium support is out of current scope.
- If Rutube uses `postMessage`/Worker/shadow DOM for visibility checks, DOM-level patches may not be sufficient.
- CSP or iframe isolation may block content script injection on some Rutube pages.
- Site updates can break selectors or player detection logic.
