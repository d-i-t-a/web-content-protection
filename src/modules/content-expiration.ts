/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule, ProtectionEventCallback } from "../types";

export interface ContentExpirationConfig {
  /** Elements to blank when session expires */
  protectedElements: HTMLElement[];
  /** Session duration in milliseconds */
  sessionDuration: number;
  /** Warning callback fired N ms before expiration */
  warningBefore?: number;
  /** Action on expiration */
  action: "blank" | "redirect" | "callback";
  /** URL to redirect to (when action is "redirect") */
  redirectUrl?: string;
  /** Allow session extension (user can click to get more time) */
  allowExtension?: boolean;
  /** Max number of extensions allowed (default: unlimited) */
  maxExtensions?: number;
  /** Duration of each extension in ms (default: same as sessionDuration) */
  extensionDuration?: number;
  /** Called when warning threshold is reached */
  onWarning?: (remainingMs: number) => void;
  /** Called when session expires */
  onExpired?: () => void;
  onEvent?: ProtectionEventCallback;
}

export class ContentExpiration implements ProtectionModule {
  private config: ContentExpirationConfig;
  private expirationTimer: ReturnType<typeof setTimeout> | null = null;
  private warningTimer: ReturnType<typeof setTimeout> | null = null;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private startTime = 0;
  private extensionCount = 0;
  private currentDuration = 0;
  private expired = false;
  private savedContents = new Map<HTMLElement, string>();

  constructor(config: ContentExpirationConfig) {
    this.config = {
      allowExtension: false,
      maxExtensions: Infinity,
      ...config,
    };
    this.currentDuration = config.sessionDuration;
  }

  activate(): void {
    this.startTime = Date.now();
    this.expired = false;
    this.startTimers();

    this.config.onEvent?.({
      type: "session_started",
      timestamp: Date.now(),
      detail: `expires in ${Math.round(this.currentDuration / 1000)}s`,
    });
  }

  deactivate(): void {
    this.clearTimers();
    this.restoreContent();
    this.expired = false;
  }

  /** Get remaining time in milliseconds */
  get remainingMs(): number {
    if (this.expired) return 0;
    const elapsed = Date.now() - this.startTime;
    return Math.max(0, this.currentDuration - elapsed);
  }

  /** Check if session has expired */
  get isExpired(): boolean {
    return this.expired;
  }

  /** Extend the session (if allowed) */
  extend(): boolean {
    if (!this.config.allowExtension) return false;
    if (this.extensionCount >= (this.config.maxExtensions ?? Infinity)) return false;

    this.extensionCount++;
    const extension = this.config.extensionDuration ?? this.config.sessionDuration;
    this.currentDuration += extension;

    // Reset timers
    this.clearTimers();
    this.startTimers();

    // Restore content if it was blanked
    if (this.expired) {
      this.restoreContent();
      this.expired = false;
    }

    this.config.onEvent?.({
      type: "session_extended",
      timestamp: Date.now(),
      detail: `extension ${this.extensionCount}, +${Math.round(extension / 1000)}s`,
    });

    return true;
  }

  private startTimers(): void {
    const remaining = this.remainingMs;

    // Warning timer
    if (this.config.warningBefore && remaining > this.config.warningBefore) {
      this.warningTimer = setTimeout(() => {
        this.config.onWarning?.(this.config.warningBefore!);
        this.config.onEvent?.({
          type: "session_warning",
          timestamp: Date.now(),
          detail: `expires in ${Math.round((this.config.warningBefore ?? 0) / 1000)}s`,
        });
      }, remaining - this.config.warningBefore);
    }

    // Expiration timer
    this.expirationTimer = setTimeout(() => this.expire(), remaining);
  }

  private clearTimers(): void {
    if (this.expirationTimer !== null) {
      clearTimeout(this.expirationTimer);
      this.expirationTimer = null;
    }
    if (this.warningTimer !== null) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
    if (this.checkInterval !== null) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private expire(): void {
    this.expired = true;

    this.config.onEvent?.({
      type: "session_expired",
      timestamp: Date.now(),
    });

    this.config.onExpired?.();

    switch (this.config.action) {
      case "blank":
        this.blankContent();
        break;
      case "redirect":
        if (this.config.redirectUrl) {
          window.location.href = this.config.redirectUrl;
        }
        break;
      case "callback":
        // onExpired already called above
        break;
    }
  }

  private blankContent(): void {
    for (const el of this.config.protectedElements) {
      this.savedContents.set(el, el.innerHTML);
      el.style.visibility = "hidden";
    }
  }

  private restoreContent(): void {
    for (const el of this.config.protectedElements) {
      el.style.visibility = "";
    }
    this.savedContents.clear();
  }
}
