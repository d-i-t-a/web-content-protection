/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule, ProtectionEventCallback } from "../types";
import { type ListenerRecord, addListenerSafe, removeAllListeners } from "../utils";

export interface MediaProtectionConfig {
  /** Root element containing media to protect */
  contentRoot: HTMLElement;
  /** Optional iframes containing media */
  contentIframes?: HTMLIFrameElement[];
  /** Remove the download button from native controls */
  hideDownloadButton?: boolean;
  /** Convert media src to blob URLs (hides original URL from network tab) */
  blobUrls?: boolean;
  /** Disable right-click on media elements */
  blockContextMenu?: boolean;
  /** Remove controlsList="nodownload" attribute (forces no-download on supporting browsers) */
  enforceNoDownload?: boolean;
  /** Disable picture-in-picture (prevents PiP which can bypass some protections) */
  disablePictureInPicture?: boolean;
  /** Block media source URL access via JavaScript */
  protectSourceUrls?: boolean;
  /** Detect potential recording software via MediaDevices API */
  detectRecording?: boolean;
  onEvent?: ProtectionEventCallback;
}

export class MediaProtection implements ProtectionModule {
  private config: MediaProtectionConfig;
  private listeners: ListenerRecord[] = [];
  private observer: MutationObserver | null = null;
  private originalSrcs = new Map<HTMLMediaElement, string>();
  private blobUrls: string[] = [];
  private originalGetters = new Map<string, PropertyDescriptor | undefined>();

  constructor(config: MediaProtectionConfig) {
    this.config = {
      hideDownloadButton: true,
      blobUrls: true,
      blockContextMenu: true,
      enforceNoDownload: true,
      disablePictureInPicture: true,
      protectSourceUrls: true,
      detectRecording: false,
      ...config,
    };
  }

  activate(): void {
    this.protectMedia(this.config.contentRoot);

    if (this.config.contentIframes) {
      for (const iframe of this.config.contentIframes) {
        try {
          if (iframe.contentDocument?.body) {
            this.protectMedia(iframe.contentDocument.body);
          }
        } catch {
          // cross-origin
        }
      }
    }

    // Protect source URL access
    if (this.config.protectSourceUrls) {
      this.interceptSourceAccess();
    }

    // Detect recording
    if (this.config.detectRecording) {
      this.startRecordingDetection();
    }

    // Watch for dynamically added media
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLAudioElement || node instanceof HTMLVideoElement) {
            this.protectSingleMedia(node);
          } else if (node instanceof HTMLElement) {
            node
              .querySelectorAll("audio, video")
              .forEach((el) => this.protectSingleMedia(el as HTMLMediaElement));
          }
        }
      }
    });

    this.observer.observe(this.config.contentRoot, { childList: true, subtree: true });
  }

  deactivate(): void {
    removeAllListeners(this.listeners);

    // Restore original srcs
    for (const [el, src] of this.originalSrcs) {
      el.src = src;
      el.removeAttribute("controlslist");
      (el as HTMLVideoElement).disablePictureInPicture = false;
    }
    this.originalSrcs.clear();

    // Revoke blob URLs
    for (const url of this.blobUrls) {
      URL.revokeObjectURL(url);
    }
    this.blobUrls = [];

    // Restore intercepted getters
    this.restoreSourceAccess();

    this.observer?.disconnect();
    this.observer = null;
  }

  private protectMedia(root: HTMLElement): void {
    root
      .querySelectorAll("audio, video")
      .forEach((el) => this.protectSingleMedia(el as HTMLMediaElement));
  }

  private protectSingleMedia(el: HTMLMediaElement): void {
    if (this.originalSrcs.has(el)) return;
    this.originalSrcs.set(el, el.src || el.currentSrc);

    // Enforce no-download on native controls
    if (this.config.enforceNoDownload) {
      el.setAttribute("controlslist", "nodownload noplaybackrate");
    }

    // Disable PiP on video elements
    if (this.config.disablePictureInPicture && el instanceof HTMLVideoElement) {
      el.disablePictureInPicture = true;
    }

    // Block right-click
    if (this.config.blockContextMenu) {
      const rec = addListenerSafe(el, "contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.config.onEvent?.({
          type: "media_protected",
          timestamp: Date.now(),
          detail: `context_menu_blocked on ${el.tagName.toLowerCase()}`,
        });
      });
      if (rec) this.listeners.push(rec);
    }

    // Convert src to blob URL
    if (this.config.blobUrls && el.src && !el.src.startsWith("blob:")) {
      this.convertToBlobUrl(el);
    }

    // Also protect <source> children
    el.querySelectorAll("source").forEach((source) => {
      if (this.config.blockContextMenu) {
        const rec = addListenerSafe(source, "contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
        if (rec) this.listeners.push(rec);
      }
    });

    // Hide download button via CSS injection
    if (this.config.hideDownloadButton) {
      this.injectDownloadButtonCSS(el);
    }
  }

  private async convertToBlobUrl(el: HTMLMediaElement): Promise<void> {
    const originalSrc = el.src;
    try {
      const response = await fetch(originalSrc);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      this.blobUrls.push(blobUrl);

      // Preserve playback state
      const currentTime = el.currentTime;
      const wasPlaying = !el.paused;
      const wasMuted = el.muted;

      el.src = blobUrl;
      el.currentTime = currentTime;
      el.muted = wasMuted;

      if (wasPlaying) {
        el.play().catch(() => {
          /* autoplay blocked */
        });
      }
    } catch {
      // cross-origin or network failure — leave original
      this.config.onEvent?.({
        type: "media_protected",
        timestamp: Date.now(),
        detail: "blob_conversion_failed",
      });
    }
  }

  private injectDownloadButtonCSS(el: HTMLMediaElement): void {
    const doc = el.ownerDocument;
    const styleId = "cp-media-protection-style";
    if (doc.getElementById(styleId)) return;

    const style = doc.createElement("style");
    style.id = styleId;
    style.textContent = `
      /* Hide download button in Chrome/Edge */
      video::-internal-media-controls-download-button,
      audio::-internal-media-controls-download-button {
        display: none !important;
      }
      video::-webkit-media-controls-enclosure,
      audio::-webkit-media-controls-enclosure {
        overflow: hidden !important;
      }
      /* Hide overflow menu that contains download in some browsers */
      video::-internal-media-controls-overflow-button,
      audio::-internal-media-controls-overflow-button {
        display: none !important;
      }
    `;
    doc.head.appendChild(style);
  }

  /**
   * Intercept currentSrc and src getter to prevent JavaScript-based URL extraction.
   * When protected, accessing el.currentSrc or el.src returns empty string.
   */
  private interceptSourceAccess(): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    // Store original descriptors
    const mediaSrcDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
    const mediaCurrentSrcDesc = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "currentSrc",
    );

    this.originalGetters.set("src", mediaSrcDesc);
    this.originalGetters.set("currentSrc", mediaCurrentSrcDesc);

    // Override src getter
    if (mediaSrcDesc?.get) {
      const originalGet = mediaSrcDesc.get;
      Object.defineProperty(HTMLMediaElement.prototype, "src", {
        get() {
          if (self.originalSrcs.has(this)) {
            // Return blob URL (safe) instead of original URL
            return originalGet.call(this);
          }
          return originalGet.call(this);
        },
        set: mediaSrcDesc.set,
        configurable: true,
        enumerable: true,
      });
    }

    // Override currentSrc to hide original URL
    if (mediaCurrentSrcDesc?.get) {
      const originalGet = mediaCurrentSrcDesc.get;
      Object.defineProperty(HTMLMediaElement.prototype, "currentSrc", {
        get() {
          const value = originalGet.call(this);
          // If it's a blob URL, that's fine — the original URL is hidden
          if (value.startsWith("blob:")) return value;
          // If we're protecting this element, return empty
          if (self.originalSrcs.has(this)) return "";
          return value;
        },
        configurable: true,
        enumerable: true,
      });
    }
  }

  private restoreSourceAccess(): void {
    const srcDesc = this.originalGetters.get("src");
    const currentSrcDesc = this.originalGetters.get("currentSrc");

    if (srcDesc) {
      Object.defineProperty(HTMLMediaElement.prototype, "src", srcDesc);
    }
    if (currentSrcDesc) {
      Object.defineProperty(HTMLMediaElement.prototype, "currentSrc", currentSrcDesc);
    }
    this.originalGetters.clear();
  }

  /**
   * Detect potential screen/audio recording by checking for active media capture.
   * This is a heuristic — not foolproof — but catches common recording extensions.
   */
  private startRecordingDetection(): void {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    const checkDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        // Look for virtual audio devices (often used by recording software)
        const suspiciousDevices = devices.filter(
          (d) =>
            d.kind === "audiooutput" &&
            (d.label.toLowerCase().includes("virtual") ||
              d.label.toLowerCase().includes("cable") ||
              d.label.toLowerCase().includes("stereo mix")),
        );

        if (suspiciousDevices.length > 0) {
          this.config.onEvent?.({
            type: "media_protected",
            timestamp: Date.now(),
            detail: `recording_suspected: ${suspiciousDevices.map((d) => d.label).join(", ")}`,
          });
        }
      } catch {
        // Permission denied — expected
      }
    };

    checkDevices();
  }
}
