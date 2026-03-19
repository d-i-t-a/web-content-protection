/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule, ProtectionEventCallback } from "../types";

export interface DevToolsDetectionConfig {
  /** What to do when DevTools is detected */
  action: "redirect" | "callback" | "both";
  /** URL to redirect to (defaults to window.location.origin) */
  redirectUrl?: string;
  /** Clear localStorage on detection */
  clearLocalStorage?: boolean;
  /** Clear sessionStorage on detection */
  clearSessionStorage?: boolean;
  /** Clear console on detection */
  clearConsole?: boolean;
  /** Polling interval in ms for heuristic fallback (default: 1000) */
  interval?: number;
  /** Delay before starting detection in ms (default: 100) */
  initDelay?: number;
  onEvent?: ProtectionEventCallback;
}

export class DevToolsDetection implements ProtectionModule {
  private config: DevToolsDetectionConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private detected = false;
  private usingLibrary = false;

  constructor(config: DevToolsDetectionConfig) {
    this.config = {
      clearLocalStorage: true,
      clearSessionStorage: true,
      clearConsole: true,
      interval: 1000,
      initDelay: 100,
      redirectUrl: typeof window !== "undefined" ? window.location.origin : "/",
      ...config,
    };
  }

  async activate(): Promise<void> {
    // Try devtools-detector library first (optional dep)
    try {
      const dtd = await import("devtools-detector");
      dtd.addListener((isOpen: boolean) => {
        if (isOpen && !this.detected) {
          this.onDetected();
        }
      });
      dtd.launch();
      this.usingLibrary = true;
    } catch {
      // Library not installed — use heuristic detection
      this.startHeuristicDetection();
    }

    // Small init delay as in the original R2D2BC implementation
    await new Promise((r) => setTimeout(r, this.config.initDelay));
  }

  deactivate(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.detected = false;
  }

  private startHeuristicDetection(): void {
    this.timer = setInterval(() => {
      if (this.isDevToolsOpen()) {
        this.onDetected();
      }
    }, this.config.interval);
  }

  private isDevToolsOpen(): boolean {
    // Heuristic 1: window outer/inner size diff (docked DevTools)
    const widthDelta = window.outerWidth - window.innerWidth > 160;
    const heightDelta = window.outerHeight - window.innerHeight > 160;
    if (widthDelta || heightDelta) return true;

    // Heuristic 2: console timing (DevTools console slows operations)
    try {
      const start = performance.now();
      for (let i = 0; i < 100; i++) console.debug();
      if (performance.now() - start > 10) return true;
    } catch {
      // ignore
    }

    return false;
  }

  private onDetected(): void {
    this.detected = true;

    if (this.config.clearConsole) {
      try { console.clear(); } catch { /* */ }
    }

    if (this.config.clearLocalStorage) {
      try { window.localStorage.clear(); } catch { /* */ }
    }

    if (this.config.clearSessionStorage) {
      try { window.sessionStorage.clear(); } catch { /* */ }
    }

    if (this.config.action === "callback" || this.config.action === "both") {
      this.config.onEvent?.({ type: "devtools_detected", timestamp: Date.now() });
    }

    if (this.config.action === "redirect" || this.config.action === "both") {
      window.location.replace(this.config.redirectUrl ?? window.location.origin);
    }
  }
}
