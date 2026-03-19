/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule, ProtectionEventCallback } from "../types";

export interface BrowserEnforcementConfig {
  /** Browser names to allow, e.g. ["chrome", "firefox", "safari", "edge"] */
  supportedBrowsers: string[];
  /** What to do when browser is unsupported */
  action: "throw" | "callback" | "both";
  onEvent?: ProtectionEventCallback;
}

/**
 * Restricts the reader to a whitelist of supported browsers.
 * Uses browserslist-useragent-regexp (optional dependency) for accurate matching,
 * falls back to basic user-agent parsing.
 */
export class BrowserEnforcement implements ProtectionModule {
  private config: BrowserEnforcementConfig;

  constructor(config: BrowserEnforcementConfig) {
    this.config = config;
  }

  async activate(): Promise<void> {
    const supported = await this.isSupported();
    if (!supported) {
      this.config.onEvent?.({
        type: "browser_unsupported",
        timestamp: Date.now(),
        detail: navigator.userAgent,
      });

      if (this.config.action === "throw" || this.config.action === "both") {
        throw new Error(
          `Browser not supported. Supported browsers: ${this.config.supportedBrowsers.join(", ")}`
        );
      }
    }
  }

  deactivate(): void {
    // No ongoing listeners
  }

  private async isSupported(): Promise<boolean> {
    // Try the browserslist-useragent-regexp library first
    try {
      const { getUserAgentRegex } = await import("browserslist-useragent-regexp");
      const queries = this.config.supportedBrowsers.map((b) => `last 1 ${b} version`);
      const regex = getUserAgentRegex({
        browsers: queries,
        allowHigherVersions: true,
      });
      return regex.test(navigator.userAgent);
    } catch {
      // Library not installed — basic fallback
      return this.basicCheck();
    }
  }

  private basicCheck(): boolean {
    const ua = navigator.userAgent.toLowerCase();
    const browserMap: Record<string, RegExp> = {
      chrome: /chrome|chromium|crios/,
      firefox: /firefox|fxios/,
      safari: /safari(?!.*chrome)/,
      edge: /edg/,
      opera: /opr|opera/,
      samsung: /samsungbrowser/,
    };

    return this.config.supportedBrowsers.some((browser) => {
      const regex = browserMap[browser.toLowerCase()];
      return regex ? regex.test(ua) : false;
    });
  }
}
