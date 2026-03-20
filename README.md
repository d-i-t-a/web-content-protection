# @d-i-t-a/web-content-protection

Client-side content protection for web-based ebook readers. Framework-agnostic, zero required dependencies, tree-shakable.

## Install

```bash
npm install @d-i-t-a/web-content-protection
```

Optional dependencies for enhanced features:

```bash
npm install devtools-detector              # Better DevTools detection
npm install browserslist-useragent-regexp   # Accurate browser enforcement
```

## Demo

An interactive demo is included that lets you toggle each module on/off and test protections in real time.

```bash
git clone https://github.com/d-i-t-a/web-content-protection.git
cd web-content-protection
npm install
npm run demo
```

Then open [http://localhost:3456/demo/](http://localhost:3456/demo/) in your browser.

The demo simulates a book reader with:
- **Left sidebar** — toggle each of the 18 modules on/off
- **Center** — sample book content with active protections
- **Right panel** — highlights & notes panel (also protected)
- **Bottom** — live event log showing every blocked action
- **Toolbar** — test buttons for copy, print, select-all, and innerText dump

Try right-clicking, Ctrl+C, Ctrl+P, dragging text, or opening DevTools to see the protections in action.

## Quick Start

Use the `ContentProtection` orchestrator to enable multiple protections at once:

```typescript
import { ContentProtection } from "@d-i-t-a/web-content-protection";

const contentEl = document.getElementById("reader-content")!;
const iframes = Array.from(document.querySelectorAll("iframe")) as HTMLIFrameElement[];

const protection = new ContentProtection({
  onEvent: (e) => console.log(`[Protection] ${e.type}`, e.detail),

  dragPrevention: { contentElement: contentEl, contentIframes: iframes },
  printProtection: { contentElement: contentEl, contentIframes: iframes },
  copyProtection: { contentElement: contentEl, contentIframes: iframes, mode: "block" },
  contextMenuProtection: { contentElement: contentEl, contentIframes: iframes },
  keyboardProtection: { contentElement: contentEl, contentIframes: iframes },
  devToolsDetection: { action: "redirect" },
  textObfuscation: {
    scrollContainer: iframes[0].contentDocument!.documentElement,
    contentRoot: iframes[0].contentDocument!.body,
  },
});

await protection.activate();
```

## Modules

Each module can be used standalone or through the orchestrator.

| Module | What it does |
|--------|-------------|
| **DragPrevention** | Blocks text/image drag-and-drop to external apps |
| **PrintProtection** | Hides content on print (CSS + event-based + keyboard) |
| **CopyProtection** | Blocks or restricts clipboard operations (block / character-limited modes) |
| **ContextMenuProtection** | Disables right-click context menu |
| **KeyboardProtection** | Blocks Save, View Source, DevTools, F12, and custom key combos |
| **DevToolsDetection** | Detects open DevTools; can redirect, clear storage, or fire callback |
| **TextObfuscation** | Scrambles text outside viewport; DOM dumps return gibberish |
| **LinkUrlHiding** | Hides link target URLs from status bar |
| **BrowserEnforcement** | Restricts to whitelisted browsers |
| **ScreenshotDetection** | Blanks content on tab blur / visibility change / PrintScreen |
| **Watermarking** | Invisible visual + zero-width-character watermarks for leak tracing |
| **SelectionLimiting** | Caps how much text can be selected at once |
| **ImageProtection** | Blocks right-click save, drag, open-in-new-tab on images; optional canvas rendering |
| **AntiAutomation** | Detects Puppeteer, Playwright, Selenium, headless browsers |
| **SpeechSynthesisBlocking** | Blocks or restricts `speechSynthesis.speak()` to prevent TTS extraction |
| **ContentExpiration** | Time-limited viewing sessions with optional extension |
| **MediaProtection** | Protects `<audio>` and `<video>` elements — hides download button, blob URLs, blocks right-click, disables PiP |
| **MediaStreamProtection** | Blocks MediaRecorder, AudioContext capture, and `captureStream()` on protected elements |

## Standalone Module Usage

```typescript
import { CopyProtection } from "@d-i-t-a/web-content-protection";

const copy = new CopyProtection({
  contentElement: document.getElementById("reader")!,
  mode: "restrict",
  maxCharacters: 200,
  onEvent: (e) => console.log(e),
});

copy.activate();
```

## Copy Protection Modes

### Block all copying
```typescript
copyProtection: { contentElement: el, mode: "block" }
```

### Allow limited copying (citations)
```typescript
copyProtection: { contentElement: el, mode: "restrict", maxCharacters: 200 }
```

### Citation bypass
```typescript
// Temporarily allow full copy for citation workflow
protection.copyProtection!.citationMode = true;
// ... user copies citation ...
protection.copyProtection!.citationMode = false;
```

## Text Obfuscation

The most effective client-side protection. All text outside the visible viewport is scrambled. A `document.body.innerText` dump returns gibberish.

```typescript
textObfuscation: {
  scrollContainer: scrollEl,
  contentRoot: bodyEl,
  excludeNodes: ["script", "style", "code"],
  viewportPadding: 50,
}
```

Call `reinitialize()` on page/chapter changes:
```typescript
protection.textObfuscation!.reinitialize();
```

## Watermarking

Two-layer watermarking for leak tracing:

1. **Visual**: Near-invisible overlay with user ID + timestamp. Survives screenshots.
2. **Text fingerprint**: Zero-width Unicode characters injected into text. Survives copy-paste.

```typescript
watermarking: {
  contentRoot: bodyEl,
  userId: "user-12345",
  sessionId: "session-abc",
  enableTextFingerprint: true,
}
```

Decode a fingerprint from leaked text:
```typescript
import { Watermarking } from "@d-i-t-a/web-content-protection";

const userId = Watermarking.decodeFingerprint(leakedText);
console.log(`Leaked by: ${userId}`);
```

## Image Protection

Prevents image extraction via right-click, drag, and open-in-new-tab.

```typescript
imageProtection: {
  contentRoot: bodyEl,
  disablePointerEvents: true,  // blocks right-click "Save image as..."
  overlayMode: true,           // transparent overlay above images
  blockDrag: true,             // prevents drag to desktop/other apps
  canvasMode: false,           // replace <img> with <canvas> (strongest)
  blobUrls: false,             // convert src to blob URLs (hides original URL)
}
```

## Anti-Automation Detection

Detects headless browsers and automation frameworks (Selenium, Puppeteer, Playwright).

```typescript
antiAutomation: {
  action: "block",             // "block" | "warn" | "callback"
  detectWebDriver: true,       // navigator.webdriver flag
  detectHeadless: true,        // HeadlessChrome, missing plugins, etc.
  detectAutomationProps: true,  // framework-specific globals
  recheckInterval: 5000,       // re-check every 5s (automation can be injected late)
}
```

## Speech Synthesis Blocking

Prevents text extraction via the Web Speech API (`speechSynthesis.speak()`).

```typescript
speechSynthesisBlocking: {
  mode: "block",               // "block" all or "restrict" to maxCharacters
  maxCharacters: 500,          // only used in "restrict" mode
}
```

## Content Expiration

Time-limited viewing sessions. Content blanks or redirects when the session expires.

```typescript
contentExpiration: {
  protectedElements: [contentEl],
  sessionDuration: 3600000,    // 1 hour
  warningBefore: 300000,       // warn 5 min before
  action: "blank",             // "blank" | "redirect" | "callback"
  allowExtension: true,        // user can extend session
  maxExtensions: 3,
  extensionDuration: 1800000,  // 30 min per extension
  onWarning: (ms) => showToast(`Session expires in ${ms/1000}s`),
  onExpired: () => showModal("Session expired"),
}
```

Extend programmatically:
```typescript
protection.contentExpiration!.extend(); // returns false if max extensions reached
```

## Clipboard Attribution

Appends source attribution to any copied text (in "restrict" mode):

```typescript
copyProtection: {
  contentElement: el,
  mode: "restrict",
  maxCharacters: 200,
  attribution: "Copied from 'Book Title' — © Publisher Name",
  attributionSeparator: "\n\n—\n",
}
```

## Media Protection

Protects `<audio>` and `<video>` elements embedded in EPUB3 or any HTML content. Especially relevant for enriched ebooks, educational content, and audiobook previews.

```typescript
mediaProtection: {
  contentRoot: bodyEl,
  hideDownloadButton: true,     // CSS-hides the native download button
  blobUrls: true,               // converts src to blob: URLs (hides original URL)
  blockContextMenu: true,       // blocks right-click "Save audio/video as..."
  enforceNoDownload: true,      // sets controlslist="nodownload"
  disablePictureInPicture: true, // prevents PiP on video elements
  protectSourceUrls: true,      // intercepts currentSrc getter
  detectRecording: false,       // detect virtual audio devices (heuristic)
}
```

## Media Stream Protection

Blocks JavaScript-based stream capture — MediaRecorder, AudioContext routing, and `captureStream()`.

```typescript
mediaStreamProtection: {
  contentRoot: bodyEl,
  blockMediaRecorder: true,     // blocks new MediaRecorder() on protected streams
  blockAudioCapture: true,      // blocks createMediaElementSource() routing
  blockCaptureStream: true,     // blocks captureStream() on media + canvas
}
```

These two modules are designed for EPUB3 media content rendered inside a web reader. The audio/video files end up as `<audio>`/`<video>` elements in the DOM — same context as the text, same protection surface.

## Screenshot Detection

Blanks content when the tab loses focus or visibility changes (common when using screenshot tools).

```typescript
screenshotDetection: {
  protectedElements: [contentEl, annotationsPanel],
  blankOnBlur: true,
  blankOnHidden: true,
  detectPrintScreen: true,
  restoreDelay: 500,
}
```

## Page Navigation

When the reader navigates to a new page or chapter, reinitialize content-dependent modules:

```typescript
reader.on("pageChange", () => {
  protection.textObfuscation?.reinitialize();
  protection.watermarking?.reinitialize();
});
```

## Event Logging

All protection events are logged:

```typescript
const events = protection.getEventLog();
// Send to analytics
analytics.track("content_protection_events", events);
```

## Integration Notes

### Finding the right elements

| Reader Architecture | Content Target | Scroll Target |
|---------------------|---------------|---------------|
| iframe-based | `iframe.contentDocument.body` | `iframe.contentDocument.documentElement` |
| Shadow DOM | `shadowRoot.querySelector('.content')` | Shadow host or inner scroller |
| Direct injection | `.reader-content` | Same element or parent |

### Adding iframes dynamically

If iframes are loaded after page init, deactivate and re-activate with new references:

```typescript
protection.deactivate();
// Update config with new iframes
const newProtection = new ContentProtection({ ...config, contentIframes: newIframes });
await newProtection.activate();
```

## License

Apache-2.0 — Copyright 2018-2026 DITA (AM Consulting LLC)
