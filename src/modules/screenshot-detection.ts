/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule, ProtectionEventCallback } from "../types";
import { type ListenerRecord, addListenerSafe, removeAllListeners } from "../utils";

export interface ScreenshotDetectionConfig {
  /** Elements to blank when screenshot/recording is suspected */
  protectedElements: HTMLElement[];
  /** Blank content when tab loses focus (Alt+Tab to screenshot tool) */
  blankOnBlur?: boolean;
  /** Blank content when page visibility changes to hidden (screen recording apps) */
  blankOnHidden?: boolean;
  /** Blank content when window is resized to exact screenshot dimensions */
  detectPrintScreen?: boolean;
  /** How long to keep content blanked after visibility returns, in ms (default: 500) */
  restoreDelay?: number;
  onEvent?: ProtectionEventCallback;
}

/**
 * Detects potential screenshot/screen capture attempts and blanks content.
 *
 * Detection strategies:
 * - Page Visibility API: content hidden when tab not active
 * - Window blur: content hidden when window loses focus
 * - PrintScreen key detection (limited browser support)
 *
 * This is a deterrent, not a hard block — it makes casual screenshotting
 * return blank pages but cannot prevent hardware capture.
 */
export class ScreenshotDetection implements ProtectionModule {
  private config: ScreenshotDetectionConfig;
  private listeners: ListenerRecord[] = [];
  private restoreTimer: ReturnType<typeof setTimeout> | null = null;
  private savedDisplays: Map<HTMLElement, string> = new Map();

  constructor(config: ScreenshotDetectionConfig) {
    this.config = {
      blankOnBlur: true,
      blankOnHidden: true,
      detectPrintScreen: true,
      restoreDelay: 500,
      ...config,
    };
  }

  activate(): void {
    // Visibility API — fires when tab is hidden/shown
    if (this.config.blankOnHidden) {
      const visHandler = () => {
        if (document.visibilityState === "hidden") {
          this.blankContent("visibility_change");
        } else {
          this.scheduleRestore();
        }
      };
      const rec = addListenerSafe(document, "visibilitychange", visHandler);
      if (rec) this.listeners.push(rec);
    }

    // Window blur — fires when user Alt+Tabs or clicks outside
    if (this.config.blankOnBlur) {
      const blurHandler = () => this.blankContent("visibility_change");
      const focusHandler = () => this.scheduleRestore();
      const r1 = addListenerSafe(window, "blur", blurHandler);
      const r2 = addListenerSafe(window, "focus", focusHandler);
      if (r1) this.listeners.push(r1);
      if (r2) this.listeners.push(r2);
    }

    // PrintScreen key (Windows/Linux) — very limited but worth having
    if (this.config.detectPrintScreen) {
      const keyHandler = (e: Event) => {
        const ke = e as KeyboardEvent;
        if (ke.key === "PrintScreen") {
          this.blankContent("screenshot_suspected");
          this.scheduleRestore();
        }
      };
      const rec = addListenerSafe(document, "keyup", keyHandler, true);
      if (rec) this.listeners.push(rec);
    }
  }

  deactivate(): void {
    removeAllListeners(this.listeners);
    this.restoreContent();
    if (this.restoreTimer) {
      clearTimeout(this.restoreTimer);
      this.restoreTimer = null;
    }
  }

  private blankContent(reason: "visibility_change" | "screenshot_suspected"): void {
    for (const el of this.config.protectedElements) {
      if (!this.savedDisplays.has(el)) {
        this.savedDisplays.set(el, el.style.display);
      }
      el.style.setProperty("visibility", "hidden", "important");
    }
    this.config.onEvent?.({ type: reason, timestamp: Date.now() });
  }

  private restoreContent(): void {
    for (const el of this.config.protectedElements) {
      el.style.removeProperty("visibility");
    }
    this.savedDisplays.clear();
  }

  private scheduleRestore(): void {
    if (this.restoreTimer) clearTimeout(this.restoreTimer);
    this.restoreTimer = setTimeout(() => {
      this.restoreContent();
      this.restoreTimer = null;
    }, this.config.restoreDelay);
  }
}
