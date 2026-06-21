# Rutube Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, or execute inline in the current session.

**Goal:** Add background-play support for `rutube.ru` via an isolated adapter without duplicating shared patches or rewriting existing YouTube/Vimeo logic.

**Architecture:** Extract generic Page Visibility API patches into `core/patches.js`. Keep `video-bg-play-content.js` as the YouTube/Vimeo bootstrap. Add `adapters/rutube.js` for Rutube-specific logic. Update `manifest.json` to load the appropriate scripts per site.

**Tech Stack:** Vanilla JavaScript, Firefox WebExtension Manifest V2, ESLint, Prettier, web-ext.

## Global Constraints

- Keep changes minimal-invasive; do not rewrite the extension from scratch.
- Preserve existing YouTube and Vimeo behavior exactly.
- Use `document.wrappedJSObject` only when available (Firefox-only).
- All site-specific logic must live in isolated adapter/bootstrap files, not scattered.
- Diagnostic logs must use the prefix `[video-bg-play][rutube]` and be gated by `const DEBUG = false`.
- Observers/listeners must be cleaned up on re-initialization.
- No dead code or magical timeouts; polling must use a reusable utility with cleanup.

---

### Task 1: Create `core/patches.js`

**Files:**
- Create: `core/patches.js`

**Interfaces:**
- Produces: `window.VideoBgPlayCore.patchPageVisibility(overrideProps)`

- [ ] **Step 1: Write the file**

```javascript
'use strict';

(function () {
  function patchPageVisibility(overrideProps = true) {
    if (overrideProps && typeof document.wrappedJSObject !== 'undefined') {
      Object.defineProperties(document.wrappedJSObject, {
        hidden: { value: false },
        visibilityState: { value: 'visible' },
      });
    }

    window.addEventListener(
      'visibilitychange',
      (evt) => evt.stopImmediatePropagation(),
      true
    );
  }

  window.VideoBgPlayCore = {
    patchPageVisibility,
  };
})();
```

- [ ] **Step 2: Verify file exists and ESLint passes**

Run: `npx eslint core/patches.js`
Expected: no errors.

---

### Task 2: Create `adapters/rutube.js`

**Files:**
- Create: `adapters/rutube.js`

**Interfaces:**
- Consumes: `window.VideoBgPlayCore.patchPageVisibility(overrideProps)`

- [ ] **Step 1: Write the adapter**

```javascript
'use strict';

const DEBUG = false;
const LOG_PREFIX = '[video-bg-play][rutube]';

function log(...args) {
  if (!DEBUG) {
    return;
  }
  console.debug(LOG_PREFIX, ...args);
}

function error(...args) {
  console.error(LOG_PREFIX, ...args);
}

const RUTUBE_PLAYER_SELECTORS = [
  'video',
  '[class*="rutube-player"]',
  '[class*="video-player"]',
  'iframe[src*="rutube.ru"]',
];

function isPlayerNode(node) {
  if (!(node instanceof Element)) {
    return false;
  }

  if (node.matches && node.matches(RUTUBE_PLAYER_SELECTORS.join(','))) {
    return true;
  }

  return RUTUBE_PLAYER_SELECTORS.some((selector) =>
    node.querySelector ? node.querySelector(selector) : false
  );
}

function blockEvent(evt) {
  evt.stopImmediatePropagation();
  log('blocked event:', evt.type);
}

function blockWindowEvents() {
  const events = ['blur', 'focus', 'pagehide', 'freeze'];
  events.forEach((type) => {
    window.addEventListener(type, blockEvent, true);
  });
}

function patchIntersectionObserver() {
  if (typeof IntersectionObserver === 'undefined') {
    return;
  }

  const OriginalIntersectionObserver = window.IntersectionObserver;

  window.IntersectionObserver = function RutubeIntersectionObserver(
    callback,
    options
  ) {
    return new OriginalIntersectionObserver((entries, observer) => {
      const spoofed = entries.map((entry) => {
        if (!isPlayerNode(entry.target)) {
          return entry;
        }

        return Object.create(entry, {
          isIntersecting: { value: true },
          intersectionRatio: { value: 1 },
        });
      });

      callback(spoofed, observer);
    }, options);
  };

  window.IntersectionObserver.prototype = OriginalIntersectionObserver.prototype;
}

function guardFullscreen() {
  // TODO: verify on real Rutube player whether fullscreenchange is used to stop playback.
  window.addEventListener('fullscreenchange', blockEvent, true);
  log('fullscreenchange guard installed');
}

function observePlayerNodes() {
  RUTUBE_PLAYER_SELECTORS.forEach((selector) => {
    document.querySelectorAll(selector).forEach((node) => {
      log('found player/video node:', selector, node);
    });
  });

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (isPlayerNode(node)) {
          log('dynamic player/video node added:', node);
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
}

let activeObserver = null;

function initRutubeAdapter() {
  try {
    log('initializing Rutube adapter on', window.location.href);

    if (activeObserver) {
      activeObserver.disconnect();
      activeObserver = null;
    }

    window.VideoBgPlayCore.patchPageVisibility(true);
    blockWindowEvents();
    patchIntersectionObserver();
    guardFullscreen();
    activeObserver = observePlayerNodes();

    log('Rutube adapter initialized');
  } catch (err) {
    error('failed to initialize adapter:', err);
  }
}

function onRouteChange() {
  log('route change detected, re-initializing');
  initRutubeAdapter();
}

function installRouteChangeListeners() {
  window.addEventListener('popstate', onRouteChange, true);
  window.addEventListener('hashchange', onRouteChange, true);

  const originalPushState = history.pushState;
  history.pushState = function patchedPushState(...args) {
    originalPushState.apply(this, args);
    onRouteChange();
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function patchedReplaceState(...args) {
    originalReplaceState.apply(this, args);
    onRouteChange();
  };
}

if (window.location.hostname.search(/(?:^|.+\)rutube\.ru/) > -1) {
  initRutubeAdapter();
  installRouteChangeListeners();
}
```

- [ ] **Step 2: Run ESLint**

Run: `npx eslint adapters/rutube.js`
Expected: no errors.

---

### Task 3: Refactor `video-bg-play-content.js` into YouTube/Vimeo bootstrap

**Files:**
- Modify: `video-bg-play-content.js`

**Interfaces:**
- Consumes: `window.VideoBgPlayCore.patchPageVisibility(overrideProps)`

- [ ] **Step 1: Replace generic Page Visibility patches with call to `VideoBgPlayCore.patchPageVisibility`**

The file should become:

```javascript
'use strict';

const IS_YOUTUBE =
  window.location.hostname.search(/(?:^|.+\.)youtube\.com/) > -1 ||
  window.location.hostname.search(/(?:^|.+\.)youtube-nocookie\.com/) > -1;
const IS_MOBILE_YOUTUBE = window.location.hostname === 'm.youtube.com';
const IS_DESKTOP_YOUTUBE = IS_YOUTUBE && !IS_MOBILE_YOUTUBE;
const IS_VIMEO = window.location.hostname.search(/(?:^|.+\.)vimeo\.com/) > -1;

const IS_ANDROID = window.navigator.userAgent.indexOf('Android') > -1;

// Page Visibility API
window.VideoBgPlayCore.patchPageVisibility(IS_ANDROID || !IS_DESKTOP_YOUTUBE);

// Fullscreen API
if (IS_VIMEO) {
  window.addEventListener(
    'fullscreenchange',
    (evt) => evt.stopImmediatePropagation(),
    true
  );
}

// User activity tracking
if (IS_YOUTUBE) {
  loop(pressKey, 60 * 1000, 10 * 1000); // every minute +/- 5 seconds
}

function pressKey() {
  const keyCodes = [18];
  let key = keyCodes[getRandomInt(0, keyCodes.length)];
  sendKeyEvent('keydown', key);
  sendKeyEvent('keyup', key);
}

function sendKeyEvent(aEvent, aKey) {
  document.dispatchEvent(
    new KeyboardEvent(aEvent, {
      bubbles: true,
      cancelable: true,
      keyCode: aKey,
      which: aKey,
    })
  );
}

function loop(aCallback, aDelay, aJitter) {
  let jitter = getRandomInt(-aJitter / 2, aJitter / 2);
  let delay = Math.max(aDelay + jitter, 0);

  window.setTimeout(() => {
    aCallback();
    loop(aCallback, aDelay, aJitter);
  }, delay);
}

function getRandomInt(aMin, aMax) {
  let min = Math.ceil(aMin);
  let max = Math.floor(aMax);
  return Math.floor(Math.random() * (max - min)) + min;
}
```

- [ ] **Step 2: Run ESLint**

Run: `npx eslint video-bg-play-content.js`
Expected: no errors.

---

### Task 4: Update `manifest.json`

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Split content_scripts into two entries**

```json
{
  "manifest_version": 2,
  "name": "__MSG_extensionName__",
  "default_locale": "en",
  "version": "1.8.1",

  "description": "__MSG_extensionDescription__",
  "icons": {
    "48": "icon.svg",
    "96": "icon.svg"
  },

  "applications": {
    "gecko": {
      "id": "video-bg-play@timdream.org",
      "strict_min_version": "58.0"
    }
  },

  "content_scripts": [
    {
      "matches": ["*://*.youtube.com/*", "*://*.youtube-nocookie.com/*", "*://*.vimeo.com/*"],
      "js": ["core/patches.js", "video-bg-play-content.js"],
      "all_frames": true
    },
    {
      "matches": ["*://*.rutube.ru/*"],
      "js": ["core/patches.js", "adapters/rutube.js"],
      "all_frames": true
    }
  ]
}
```

- [ ] **Step 2: Validate manifest**

Run: `npx web-ext lint`
Expected: no manifest errors.

---

### Task 5: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add Rutube to supported sites**

Add `rutube.ru` to the Sites list.

- [ ] **Step 2: Add "How it works on Rutube" section**

Describe the patches applied: Page Visibility, blur/focus/pagehide/freeze blocking, IntersectionObserver spoofing for player nodes, fullscreenchange guard, dynamic player detection, SPA route change re-initialization.

- [ ] **Step 3: Add limitations section**

Mention Firefox-only `wrappedJSObject`, CSP/iframe isolation, shadow DOM, player API / `postMessage`, and site updates as potential limitations.

- [ ] **Step 4: Add manual verification steps**

List steps: open video, switch tab, lock screen, switch apps, navigate between videos without reload.

---

### Task 6: Run full validation

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: passes.

- [ ] **Step 2: Format check**

Run: `npm run format:check`
Expected: passes.

- [ ] **Step 3: Extension validation**

Run: `npm run validate`
Expected: passes.

- [ ] **Step 4: Full check**

Run: `npm run check`
Expected: passes.

---

## Spec Coverage Review

| Spec requirement | Implementing task |
|---|---|
| Separate adapter for Rutube | Task 2 |
| Shared core patches | Task 1 |
| Bootstrap for YouTube/Vimeo | Task 3 |
| Rutube hostname matching | Task 2, Task 4 |
| Page Visibility / focus / blur / pagehide / freeze | Task 2 |
| IntersectionObserver spoofing | Task 2 |
| Fullscreen guard | Task 2 (with TODO) |
| Dynamic player detection | Task 2 |
| SPA route change re-init | Task 2 |
| Diagnostic DEBUG logging | Task 2 |
| README updates | Task 5 |
| Lint / validate | Task 6 |
