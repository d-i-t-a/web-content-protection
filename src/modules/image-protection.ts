/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule, ProtectionEventCallback } from "../types";
import { type ListenerRecord, addListenerSafe, removeAllListeners } from "../utils";

export interface ImageProtectionConfig {
  /** Root element containing images to protect */
  contentRoot: HTMLElement;
  /** Optional iframes containing images */
  contentIframes?: HTMLIFrameElement[];
  /** Replace <img> with canvas renders (strongest, but heavier) */
  canvasMode?: boolean;
  /** Disable pointer-events on images (prevents save-image context menu) */
  disablePointerEvents?: boolean;
  /** Add transparent overlay above images to intercept interactions */
  overlayMode?: boolean;
  /** Block image drag (also handled by DragPrevention, but this is image-specific) */
  blockDrag?: boolean;
  /** Disable "Open image in new tab" by replacing src with blob URLs */
  blobUrls?: boolean;
  onEvent?: ProtectionEventCallback;
}

export class ImageProtection implements ProtectionModule {
  private config: ImageProtectionConfig;
  private listeners: ListenerRecord[] = [];
  private overlays: HTMLElement[] = [];
  private originalSrcs = new Map<HTMLImageElement, string>();
  private canvasReplacements = new Map<HTMLCanvasElement, HTMLImageElement>();
  private observer: MutationObserver | null = null;

  constructor(config: ImageProtectionConfig) {
    this.config = {
      disablePointerEvents: true,
      overlayMode: true,
      blockDrag: true,
      canvasMode: false,
      blobUrls: false,
      ...config,
    };
  }

  activate(): void {
    this.protectImages(this.config.contentRoot);

    if (this.config.contentIframes) {
      for (const iframe of this.config.contentIframes) {
        try {
          if (iframe.contentDocument?.body) {
            this.protectImages(iframe.contentDocument.body);
          }
        } catch {
          // cross-origin
        }
      }
    }

    // Watch for dynamically added images
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLImageElement) {
            this.protectSingleImage(node);
          } else if (node instanceof HTMLElement) {
            const imgs = node.querySelectorAll("img");
            imgs.forEach((img) => this.protectSingleImage(img));
          }
        }
      }
    });

    this.observer.observe(this.config.contentRoot, { childList: true, subtree: true });
  }

  deactivate(): void {
    removeAllListeners(this.listeners);

    // Remove overlays
    for (const overlay of this.overlays) {
      overlay.parentElement?.removeChild(overlay);
    }
    this.overlays = [];

    // Restore original srcs
    for (const [img, src] of this.originalSrcs) {
      img.src = src;
      img.style.pointerEvents = "";
      img.draggable = true;
    }
    this.originalSrcs.clear();

    // Restore canvas replacements
    for (const [canvas, img] of this.canvasReplacements) {
      canvas.parentElement?.replaceChild(img, canvas);
    }
    this.canvasReplacements.clear();

    this.observer?.disconnect();
    this.observer = null;
  }

  private protectImages(root: HTMLElement): void {
    const images = root.querySelectorAll("img");
    images.forEach((img) => this.protectSingleImage(img));
  }

  private protectSingleImage(img: HTMLImageElement): void {
    // Already protected
    if (this.originalSrcs.has(img)) return;

    this.originalSrcs.set(img, img.src);

    // Disable pointer events (prevents right-click "Save image as...")
    if (this.config.disablePointerEvents) {
      img.style.pointerEvents = "none";
    }

    // Block drag
    if (this.config.blockDrag) {
      img.draggable = false;
      const rec = addListenerSafe(img, "dragstart", (e) => {
        e.preventDefault();
        this.config.onEvent?.({ type: "image_protected", timestamp: Date.now(), detail: "drag_blocked" });
      });
      if (rec) this.listeners.push(rec);
    }

    // Add transparent overlay
    if (this.config.overlayMode && !this.config.canvasMode) {
      this.addOverlay(img);
    }

    // Replace with canvas rendering
    if (this.config.canvasMode) {
      this.replaceWithCanvas(img);
    }

    // Convert src to blob URL (prevents "Open in new tab" revealing the URL)
    if (this.config.blobUrls && !this.config.canvasMode) {
      this.convertToBlobUrl(img);
    }

    // Block right-click on image specifically
    const rec = addListenerSafe(img, "contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.config.onEvent?.({ type: "image_protected", timestamp: Date.now(), detail: "context_menu_blocked" });
    });
    if (rec) this.listeners.push(rec);
  }

  private addOverlay(img: HTMLImageElement): void {
    const parent = img.parentElement;
    if (!parent) return;

    // Ensure parent is positioned
    const computed = getComputedStyle(parent);
    if (computed.position === "static") {
      parent.style.position = "relative";
    }

    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 1;
      background: transparent;
      cursor: default;
    `;
    overlay.dataset.contentProtection = "image-overlay";

    // Block everything on the overlay
    const rec = addListenerSafe(overlay, "contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    if (rec) this.listeners.push(rec);

    parent.appendChild(overlay);
    this.overlays.push(overlay);
  }

  private replaceWithCanvas(img: HTMLImageElement): void {
    // Wait for image to load before replacing
    const doReplace = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        canvas.style.cssText = img.style.cssText;
        canvas.className = img.className;

        // Copy size attributes
        if (img.width) canvas.style.width = `${img.width}px`;
        if (img.height) canvas.style.height = `${img.height}px`;

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }

        // Block right-click and drag on canvas
        const rec1 = addListenerSafe(canvas, "contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
        if (rec1) this.listeners.push(rec1);

        const rec2 = addListenerSafe(canvas, "dragstart", (e) => {
          e.preventDefault();
        });
        if (rec2) this.listeners.push(rec2);

        if (img.parentElement) {
          img.parentElement.replaceChild(canvas, img);
          this.canvasReplacements.set(canvas, img);
        }
      } catch {
        // cross-origin image — canvas tainting
        this.config.onEvent?.({
          type: "image_protected",
          timestamp: Date.now(),
          detail: "canvas_tainted_fallback",
        });
      }
    };

    if (img.complete) {
      doReplace();
    } else {
      img.addEventListener("load", doReplace, { once: true });
    }
  }

  private async convertToBlobUrl(img: HTMLImageElement): Promise<void> {
    try {
      const response = await fetch(img.src);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      img.src = blobUrl;
    } catch {
      // cross-origin or network failure — leave original
    }
  }
}
