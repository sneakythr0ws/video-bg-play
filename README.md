# Video Background Play Fix  ![logo](/icon.svg)

Firefox for Android can continue playing video even if you switch to another tab or app.
However, sites can detect these user actions with the [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) and the [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API).
This add-on is designed to block events and properties exposed by the APIs.

## License

Add-on code: MIT.

"[Glasses](https://thenounproject.com/term/glasses/1473422)" icon used in the logo by rahmatmasiv from [the Noun Project](https://thenounproject.com/)  under the [CC BY 3.0 US](https://creativecommons.org/licenses/by/3.0/us/).

## Technical detail

The add-on injects a content script to replace the properties exposed, and stops events from propagating when applicable.

### Page Visibility API

The add-on blocks `visibilitychange` event, and set `document.hidden` to be always `false` and `document.visibilityState` to be forever `visible`.

### Fullscreen API

The add-on doesn't generally override the Fullscreen API because at the moment this is not required and the original implementation caused some broken UI after existing fullscreen.
As a site-specific workaround, we do however block `fullscreenchange` events on Vimeo to prevent playback from stopping when exiting fullscreen.

### User activity tracking

Some pages stop playback if they don't detect any user activity for a certain amount of time. To avoid this, the add-on ensures that the time of the last user activity is regularly updated.

## Sites

As a demonstration, the content script currently injects itself to the following sites:

* youtube.com and youtube-nocookie.com
* vimeo.com
* rutube.ru

## How it works on Rutube

On Rutube the add-on loads a dedicated platform adapter (`adapters/rutube.js`) that applies the same shared Page Visibility patches and additionally:

* blocks `blur`, `focus`, `pagehide`, and `freeze` events before they reach the player scripts;
* wraps `IntersectionObserver` so that the `<video>` / player element always appears to be in the viewport;
* guards `fullscreenchange` events in case Rutube pauses playback when exiting fullscreen;
* observes the DOM for dynamically inserted player nodes and re-initializes itself on SPA navigation.

Diagnostic logging is available by setting `const DEBUG = false` to `true` at the top of `adapters/rutube.js`; logs are prefixed with `[video-bg-play][rutube]`.

## Limitations

* The add-on is built for Firefox and uses `document.wrappedJSObject`, which is not available in Chromium-based browsers.
* If Rutube performs visibility checks inside a cross-origin iframe, a Web Worker, or via `postMessage`, DOM-level patches may not be sufficient.
* Site updates can change player selectors or introduce new pause mechanisms.

## Manual verification (Rutube)

1. Open any video on `https://rutube.ru`.
2. Start playback.
3. Switch to another tab — audio should continue.
4. Lock the screen or switch to another app — audio should continue.
5. Navigate to another video without reloading the page — playback should keep working in the background.
