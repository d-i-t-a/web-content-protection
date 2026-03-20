/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule, ProtectionEventCallback } from "../types";

export interface TamperDetectionConfig {
  /** Elements to protect (blank when tamper detected) */
  protectedElements: HTMLElement[];
  /** Root element to place sentinels in */
  contentRoot: HTMLElement;
  /** Number of sentinel elements to distribute (default: 3) */
  sentinelCount?: number;
  /** Action on detection */
  action: "blank" | "scramble" | "callback";
  /** Auto-restore after tampering stops (default: false) */
  autoRestore?: boolean;
  /** Restore delay in ms after tamper stops (default: 1000) */
  restoreDelay?: number;
  /**
   * Additional CSS properties to watch on sentinels.
   * Default watches: animation, transition, position, transform, opacity, visibility, display, filter.
   * Screen grabbers typically inject animation/transition for capture timing.
   */
  watchProperties?: string[];
  onEvent?: ProtectionEventCallback;
}

export class TamperDetection implements ProtectionModule {
  private config: TamperDetectionConfig;
  private sentinels: HTMLDivElement[] = [];
  private isHacked = false;
  private savedVisibility = new Map<HTMLElement, string>();
  private restoreTimer: ReturnType<typeof setTimeout> | null = null;
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: TamperDetectionConfig) {
    this.config = {
      sentinelCount: 3,
      autoRestore: false,
      restoreDelay: 1000,
      watchProperties: [
        "animation",
        "transition",
        "position",
        "transform",
        "opacity",
        "visibility",
        "display",
        "filter",
        "clip",
        "clip-path",
      ],
      ...config,
    };
  }

  /** Whether tampering has been detected */
  get tampered(): boolean {
    return this.isHacked;
  }

  activate(): void {
    this.isHacked = false;
    this.placeSentinels();
    this.startObserver();
    // Periodic check as backup (some injections bypass mutation observer)
    this.checkInterval = setInterval(() => this.checkSentinels(), 2000);
  }

  deactivate(): void {
    // Remove sentinels
    for (const sentinel of this.sentinels) {
      sentinel.remove();
    }
    this.sentinels = [];

    // Disconnect observers
    for (const obs of this.observers) {
      obs.disconnect();
    }
    this.observers = [];

    // Clear timers
    if (this.restoreTimer !== null) {
      clearTimeout(this.restoreTimer);
      this.restoreTimer = null;
    }
    if (this.checkInterval !== null) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Restore visibility
    this.restoreContent();
    this.isHacked = false;
  }

  /**
   * Place invisible sentinel elements throughout the content.
   * Screen grabber extensions inject CSS on elements to control capture timing.
   * If any sentinel gets a style attribute, we know something is tampering.
   */
  private placeSentinels(): void {
    const count = this.config.sentinelCount ?? 3;
    const root = this.config.contentRoot;
    const children = Array.from(root.children);

    for (let i = 0; i < count; i++) {
      const sentinel = document.createElement("div");
      // Make it invisible but present in the DOM
      sentinel.style.cssText =
        "width:0;height:0;overflow:hidden;position:absolute;pointer-events:none;";
      sentinel.dataset.contentProtection = "sentinel";
      sentinel.setAttribute("aria-hidden", "true");

      // Distribute sentinels throughout the content
      if (children.length > 0) {
        const insertIndex = Math.floor((i / count) * children.length);
        const refNode = children[Math.min(insertIndex, children.length - 1)];
        root.insertBefore(sentinel, refNode);
      } else {
        root.appendChild(sentinel);
      }

      this.sentinels.push(sentinel);
    }
  }

  /**
   * Watch sentinels for any style attribute changes.
   * Screen grabbers (GoFullPage, Nimbus Screenshot, Awesome Screenshot, etc.)
   * inject CSS styles like animation, transition, or transform to time their captures.
   */
  private observers: MutationObserver[] = [];

  private startObserver(): void {
    // Observe each sentinel individually for attribute changes
    // Do NOT observe the whole contentRoot subtree — that causes infinite loops
    // when blankContent() modifies styles on protected elements
    for (const sentinel of this.sentinels) {
      const attrObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "attributes") {
            if (mutation.attributeName === "style" || mutation.attributeName === "class") {
              this.onTamperDetected("sentinel_style_injected");
              return;
            }
          }
        }
      });
      attrObserver.observe(sentinel, {
        attributes: true,
        attributeFilter: ["style", "class"],
      });
      this.observers.push(attrObserver);
    }

    // Observe contentRoot direct children only (not subtree) for sentinel removal
    const childObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const removed of mutation.removedNodes) {
            if (this.sentinels.includes(removed as HTMLDivElement)) {
              this.onTamperDetected("sentinel_removed");
              return;
            }
          }
        }
      }
    });
    childObserver.observe(this.config.contentRoot, {
      childList: true,
      subtree: false,
    });
    this.observers.push(childObserver);
  }

  /**
   * Periodic check for CSS injection that might bypass mutation observer.
   * Checks computed styles on sentinels for suspicious properties.
   */
  private checkSentinels(): void {
    for (const sentinel of this.sentinels) {
      // Check if sentinel was removed
      if (!sentinel.isConnected) {
        this.onTamperDetected("sentinel_removed");
        return;
      }

      // Check for inline style injection
      if (this.hasSuspiciousStyles(sentinel)) {
        this.onTamperDetected("sentinel_style_injected");
        return;
      }

      // Check computed styles for injected CSS rules (class-based injection)
      if (this.hasSuspiciousComputedStyles(sentinel)) {
        this.onTamperDetected("computed_style_anomaly");
        return;
      }
    }

    // If previously hacked but sentinels are now clean, consider auto-restore
    if (this.isHacked && this.config.autoRestore) {
      this.scheduleRestore();
    }
  }

  /** Check for directly injected inline styles beyond what we set */
  private hasSuspiciousStyles(el: HTMLElement): boolean {
    // Only flag properties that screen grabbers inject — NOT properties we set ourselves
    // We set: width, height, overflow, position, pointer-events
    // Screen grabbers inject: animation, transition, transform, filter, clip, opacity changes
    if (
      el.style.animation ||
      el.style.transition ||
      el.style.transform ||
      el.style.filter ||
      el.style.clip ||
      el.style.clipPath
    ) {
      return true;
    }
    return false;
  }

  /** Check computed styles for CSS rule injection (via class/id selectors) */
  private hasSuspiciousComputedStyles(el: HTMLElement): boolean {
    try {
      const computed = getComputedStyle(el);
      // Only check properties that screen grabbers inject
      // Browsers have various defaults for transition — accept all common defaults
      if (computed.animationName && computed.animationName !== "none") return true;
      if (computed.transform && computed.transform !== "none") return true;
      if (computed.filter && computed.filter !== "none") return true;
    } catch {
      // ignore
    }
    return false;
  }

  private onTamperDetected(detail: string): void {
    if (this.isHacked) return; // already handled

    this.isHacked = true;
    this.config.onEvent?.({
      type: "tamper_detected",
      timestamp: Date.now(),
      detail,
    });

    switch (this.config.action) {
      case "blank":
        this.blankContent();
        break;
      case "scramble":
        // Scramble is handled by text obfuscation module listening to tamper events
        // We still blank as a fallback
        this.blankContent();
        break;
      case "callback":
        // onEvent already fired above
        break;
    }
  }

  private blankContent(): void {
    for (const el of this.config.protectedElements) {
      if (!this.savedVisibility.has(el)) {
        this.savedVisibility.set(el, el.style.visibility);
      }
      el.style.setProperty("visibility", "hidden", "important");
    }
  }

  private restoreContent(): void {
    for (const [el, vis] of this.savedVisibility) {
      el.style.visibility = vis;
    }
    this.savedVisibility.clear();
  }

  private scheduleRestore(): void {
    if (this.restoreTimer !== null) return;
    this.restoreTimer = setTimeout(() => {
      this.restoreTimer = null;
      // Only restore if sentinels are clean now
      const stillTampered = this.sentinels.some(
        (s) => !s.isConnected || this.hasSuspiciousStyles(s) || this.hasSuspiciousComputedStyles(s)
      );
      if (!stillTampered) {
        this.isHacked = false;
        this.restoreContent();
        this.config.onEvent?.({
          type: "tamper_detected",
          timestamp: Date.now(),
          detail: "restored",
        });
      }
    }, this.config.restoreDelay ?? 1000);
  }
}
