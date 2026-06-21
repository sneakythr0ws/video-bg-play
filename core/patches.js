'use strict';

/**
 * Shared browser API patches used by all platform adapters.
 *
 * Exposed on window.VideoBgPlayCore so that content scripts loaded
 * later in the same context can reuse the same primitives without
 * duplicating code.
 */
(function () {
  /**
   * Neutralize the Page Visibility API.
   *
   * @param {boolean} [overrideProps=true] - If true, override
   *   document.hidden and document.visibilityState so the page always
   *   thinks it is visible. Some sites (e.g. desktop YouTube) break if
   *   the properties are always overridden, so callers can opt out.
   */
  function patchPageVisibility(overrideProps = true) {
    if (overrideProps && typeof document.wrappedJSObject !== 'undefined') {
      Object.defineProperties(document.wrappedJSObject, {
        hidden: { value: false },
        visibilityState: { value: 'visible' },
      });
    }

    window.addEventListener('visibilitychange', (evt) => evt.stopImmediatePropagation(), true);
  }

  window.VideoBgPlayCore = {
    patchPageVisibility,
  };
})();
