'use strict';

/**
 * Rutube platform adapter for video-bg-play.
 *
 * Keeps Rutube videos playing when the tab is backgrounded by neutralizing
 * Page Visibility API, focus/blur/pagehide/freeze events, viewport checks,
 * and fullscreen guards that the player may use to pause playback.
 */

const DEBUG = false;
const LOG_PREFIX = '[video-bg-play][rutube]';

const RUTUBE_PLAYER_SELECTORS = [
  'video',
  '[class*="rutube-player"]',
  '[class*="video-player"]',
  'iframe[src*="rutube.ru"]',
].join(',');

/**
 * Log a debug message when DEBUG is enabled.
 * @param {...*} args
 */
function log(...args) {
  if (DEBUG) {
    console.debug(LOG_PREFIX, ...args);
  }
}

/**
 * Log an error with the adapter prefix.
 * @param {...*} args
 */
function error(...args) {
  console.error(LOG_PREFIX, ...args);
}

/**
 * Determine whether a DOM node is, or contains, a Rutube player/video node.
 * @param {Node} node
 * @returns {boolean}
 */
function isPlayerNode(node) {
  if (!(node instanceof Element)) {
    return false;
  }

  if (node.matches && node.matches(RUTUBE_PLAYER_SELECTORS)) {
    return true;
  }

  return !!node.querySelector && node.querySelector(RUTUBE_PLAYER_SELECTORS) !== null;
}

/**
 * Log all currently present player/video nodes for diagnostics.
 */
function logPlayerNodes() {
  document.querySelectorAll(RUTUBE_PLAYER_SELECTORS).forEach((node) => {
    log('found player/video node:', node);
  });
}

/**
 * Stop event propagation for a window-level event.
 * @param {Event} evt
 */
function blockEvent(evt) {
  evt.stopImmediatePropagation();
  log('blocked event:', evt.type);
}

/**
 * Block window-level events that sites use to detect the page going to the
 * background or losing focus.
 */
function blockWindowEvents() {
  ['blur', 'focus', 'pagehide', 'freeze'].forEach((type) => {
    window.addEventListener(type, blockEvent, true);
  });
}

/**
 * Wrap IntersectionObserver so that player/video targets always appear to be
 * fully visible. This defeats viewport-based pause logic without globally
 * breaking lazy-loading or analytics for other elements.
 */
function patchIntersectionObserver() {
  if (typeof IntersectionObserver === 'undefined') {
    return;
  }

  const OriginalIntersectionObserver = window.IntersectionObserver;

  function RutubeIntersectionObserver(callback, options) {
    const wrappedCallback = (entries, observer) => {
      const spoofed = entries.map((entry) => {
        if (!isPlayerNode(entry.target)) {
          return entry;
        }

        return new Proxy(entry, {
          get(target, prop) {
            if (prop === 'isIntersecting') {
              return true;
            }
            if (prop === 'intersectionRatio') {
              return 1;
            }

            const value = target[prop];
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      });

      callback(spoofed, observer);
    };

    return new OriginalIntersectionObserver(wrappedCallback, options);
  }

  RutubeIntersectionObserver.prototype = OriginalIntersectionObserver.prototype;
  window.IntersectionObserver = RutubeIntersectionObserver;
}

/**
 * Guard fullscreenchange events. Rutube may pause playback on fullscreen exit
 * by listening to this event.
 *
 */
function guardFullscreen() {
  window.addEventListener('fullscreenchange', blockEvent, true);
  log('fullscreenchange guard installed');
}

/**
 * Observe DOM for dynamically inserted player/video nodes and log them.
 * @returns {MutationObserver|null}
 */
function observePlayerNodes() {
  logPlayerNodes();

  if (!document.body) {
    return null;
  }

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
let windowEventsInstalled = false;
let intersectionObserverPatched = false;
let fullscreenGuardInstalled = false;

/**
 * Initialize or re-initialize the Rutube adapter.
 *
 * Window-level patches are installed only once. DOM-specific setup
 * (player observation) is restarted on every call so that it picks up
 * nodes created after a SPA navigation or dynamic mount.
 */
function initRutubeAdapter() {
  try {
    log('initializing Rutube adapter on', window.location.href);

    if (activeObserver) {
      activeObserver.disconnect();
      activeObserver = null;
    }

    window.VideoBgPlayCore.patchPageVisibility(true);

    if (!windowEventsInstalled) {
      blockWindowEvents();
      windowEventsInstalled = true;
    }

    if (!intersectionObserverPatched) {
      patchIntersectionObserver();
      intersectionObserverPatched = true;
    }

    if (!fullscreenGuardInstalled) {
      guardFullscreen();
      fullscreenGuardInstalled = true;
    }

    activeObserver = observePlayerNodes();

    log('Rutube adapter initialized');
  } catch (err) {
    error('failed to initialize adapter:', err);
  }
}

/**
 * Re-initialize the adapter after a SPA route change.
 */
function onRouteChange() {
  log('route change detected, re-initializing');
  initRutubeAdapter();
}

let routeChangeListenersInstalled = false;

/**
 * Listen for navigation changes that do not trigger a full page reload.
 */
function installRouteChangeListeners() {
  if (routeChangeListenersInstalled) {
    return;
  }

  window.addEventListener('popstate', onRouteChange, true);
  window.addEventListener('hashchange', onRouteChange, true);

  const originalPushState = history.pushState.bind(history);
  history.pushState = function patchedPushState(...args) {
    originalPushState(...args);
    onRouteChange();
  };

  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = function patchedReplaceState(...args) {
    originalReplaceState(...args);
    onRouteChange();
  };

  routeChangeListenersInstalled = true;
}

const IS_RUTUBE = window.location.hostname.search(/(?:^|.+\.)rutube\.ru/) > -1;

if (IS_RUTUBE) {
  initRutubeAdapter();
  installRouteChangeListeners();
}
