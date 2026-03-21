/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule, ProtectionEventCallback } from "../types";

export interface AntiAutomationConfig {
  /** Action when automation is detected */
  action: "block" | "warn" | "callback";
  /** URL to redirect to when action is "block" */
  redirectUrl?: string;
  /** Message to display when blocked */
  blockedMessage?: string;
  /** Check for headless browser indicators */
  detectHeadless?: boolean;
  /** Check for WebDriver flag (Selenium, Puppeteer, Playwright) */
  detectWebDriver?: boolean;
  /** Check for automation-specific properties */
  detectAutomationProps?: boolean;
  /** Check for missing browser plugins (headless browsers have none) */
  detectMissingPlugins?: boolean;
  /** Check for inconsistent screen/window dimensions */
  detectScreenAnomalies?: boolean;
  /** Interval in ms to re-check (automation can be injected after load) */
  recheckInterval?: number;
  onEvent?: ProtectionEventCallback;
}

interface DetectionResult {
  detected: boolean;
  reasons: string[];
}

export class AntiAutomation implements ProtectionModule {
  private config: AntiAutomationConfig;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(config: AntiAutomationConfig) {
    this.config = {
      detectHeadless: true,
      detectWebDriver: true,
      detectAutomationProps: true,
      detectMissingPlugins: true,
      detectScreenAnomalies: true,
      recheckInterval: 5000,
      ...config,
    };
  }

  activate(): void {
    this.runDetection();

    if (this.config.recheckInterval && this.config.recheckInterval > 0) {
      this.intervalId = setInterval(() => this.runDetection(), this.config.recheckInterval);
    }
  }

  deactivate(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Run detection manually and return result */
  detect(): DetectionResult {
    return this.checkAll();
  }

  private runDetection(): void {
    const result = this.checkAll();
    if (result.detected) {
      this.config.onEvent?.({
        type: "automation_detected",
        timestamp: Date.now(),
        detail: result.reasons.join(", "),
      });

      if (this.config.action === "block") {
        this.blockAccess();
      }
    }
  }

  private checkAll(): DetectionResult {
    const reasons: string[] = [];

    if (this.config.detectWebDriver && this.checkWebDriver()) {
      reasons.push("webdriver");
    }
    if (this.config.detectHeadless && this.checkHeadless()) {
      reasons.push("headless");
    }
    if (this.config.detectAutomationProps && this.checkAutomationProps()) {
      reasons.push("automation_props");
    }
    if (this.config.detectMissingPlugins && this.checkMissingPlugins()) {
      reasons.push("no_plugins");
    }
    if (this.config.detectScreenAnomalies && this.checkScreenAnomalies()) {
      reasons.push("screen_anomaly");
    }

    return { detected: reasons.length > 0, reasons };
  }

  /** navigator.webdriver is set by Selenium, Puppeteer, Playwright */
  private checkWebDriver(): boolean {
    try {
      // Standard property
      if ((navigator as any).webdriver === true) return true;

      // Check for deleted/redefined property
      const desc = Object.getOwnPropertyDescriptor(navigator, "webdriver");
      if (desc && desc.get) return true;

      // Puppeteer-specific
      if ((window as any).__puppeteer_evaluation_script__) return true;

      // Playwright-specific
      if ((window as any).__playwright) return true;
      if ((window as any).__pw_manual) return true;

      // Selenium-specific
      if ((document as any).__selenium_unwrapped) return true;
      if ((document as any).__webdriver_evaluate) return true;
      if ((document as any).__driver_evaluate) return true;
    } catch {
      // ignore
    }
    return false;
  }

  /** Headless browsers have telltale signs */
  private checkHeadless(): boolean {
    try {
      // Chrome headless user agent
      if (/HeadlessChrome/i.test(navigator.userAgent)) return true;

      // Phantom.js
      if ((window as any).callPhantom || (window as any)._phantom) return true;

      // Nightmare.js
      if ((window as any).__nightmare) return true;

      // Chrome headless lacks chrome.runtime
      if (/Chrome/.test(navigator.userAgent) && !(window as any).chrome?.runtime) {
        // Could be headless — but also could be an iframe, so check more
        if (navigator.languages?.length === 0) return true;
      }

      // Headless browsers often have empty language arrays
      if (!navigator.languages || navigator.languages.length === 0) return true;
    } catch {
      // ignore
    }
    return false;
  }

  /** Check for automation framework globals */
  private checkAutomationProps(): boolean {
    const suspects = [
      "domAutomation",
      "domAutomationController",
      "_Selenium_IDE_Recorder",
      "callSelenium",
      "_WEBDRIVER_ELEM_CACHE",
      "ChromeDriverw",
      "cdc_adoQpoasnfa76pfcZLmcfl_Array",
      "cdc_adoQpoasnfa76pfcZLmcfl_Promise",
      "cdc_adoQpoasnfa76pfcZLmcfl_Symbol",
    ];

    for (const prop of suspects) {
      try {
        if ((window as any)[prop] !== undefined) return true;
        if ((document as any)[prop] !== undefined) return true;
      } catch {
        // ignore
      }
    }
    return false;
  }

  /** Headless browsers typically have zero plugins */
  private checkMissingPlugins(): boolean {
    try {
      // Real browsers almost always have plugins
      if (navigator.plugins.length === 0) {
        // Double-check — some privacy browsers strip plugins too
        // Only flag if combined with another signal
        if (/Chrome/.test(navigator.userAgent) && navigator.plugins.length === 0) {
          return true;
        }
      }
    } catch {
      // ignore
    }
    return false;
  }

  /** Automation tools sometimes have inconsistent screen dimensions */
  private checkScreenAnomalies(): boolean {
    try {
      // Screen dimensions of 0 or matching exactly are suspicious
      if (screen.width === 0 || screen.height === 0) return true;

      // outerWidth/outerHeight of 0 is suspicious (headless has no real window)
      if (window.outerWidth === 0 && window.outerHeight === 0) return true;
    } catch {
      // ignore
    }
    return false;
  }

  private blockAccess(): void {
    if (this.config.redirectUrl) {
      window.location.href = this.config.redirectUrl;
    } else {
      // Blank the page
      document.body.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100vh;
                    font-family:system-ui;color:#666;text-align:center;">
          <div>
            <h1 style="font-size:24px;margin-bottom:8px;">Access Denied</h1>
            <p>${this.config.blockedMessage ?? "Automated access is not permitted."}</p>
          </div>
        </div>
      `;
    }
  }
}
