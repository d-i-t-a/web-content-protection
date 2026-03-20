# Changelog

## 1.0.0 (2026-03-20)

Initial release.

### Modules

- **DragPrevention** — Blocks text/image drag-and-drop
- **PrintProtection** — Hides content on print (CSS + keyboard)
- **CopyProtection** — Blocks or restricts clipboard (block / restrict modes, citation bypass, attribution)
- **ContextMenuProtection** — Disables right-click context menu
- **KeyboardProtection** — Blocks Save, View Source, DevTools, F12
- **DevToolsDetection** — Detects open DevTools via window size heuristic or devtools-detector library
- **TextObfuscation** — Scrambles text outside visible viewport; DOM dumps return gibberish
- **LinkUrlHiding** — Hides link target URLs from status bar
- **BrowserEnforcement** — Restricts to whitelisted browsers
- **ScreenshotDetection** — Blanks content on tab blur / visibility change / PrintScreen
- **Watermarking** — Visual overlay + zero-width Unicode character fingerprinting
- **SelectionLimiting** — Caps how much text can be selected
- **ImageProtection** — Blocks save, drag, open-in-new-tab on images; optional canvas rendering
- **AntiAutomation** — Detects Puppeteer, Playwright, Selenium, headless browsers
- **SpeechSynthesisBlocking** — Blocks or restricts speechSynthesis.speak()
- **ContentExpiration** — Time-limited viewing sessions with extension support
- **MediaProtection** — Protects audio/video elements (download button, blob URLs, PiP, source URLs)
- **MediaStreamProtection** — Blocks MediaRecorder, AudioContext capture, captureStream, getDisplayMedia
- **TamperDetection** — Screen grabber CSS injection detection via hidden sentinels

### Features

- Framework-agnostic, zero required dependencies
- Tree-shakable — use individual modules or the orchestrator
- ESM + CJS dual output with TypeScript declarations
- Interactive demo with all 19 modules toggleable
- Global event logging for analytics integration
- Optional dependencies: `devtools-detector`, `browserslist-useragent-regexp`
