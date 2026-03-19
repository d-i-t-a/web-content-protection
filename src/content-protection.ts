/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule, ProtectionEvent, ProtectionEventCallback, CommonTargets } from "./types";
import { DragPrevention, type DragPreventionConfig } from "./modules/drag-prevention";
import { PrintProtection, type PrintProtectionConfig } from "./modules/print-protection";
import { CopyProtection, type CopyProtectionConfig } from "./modules/copy-protection";
import { ContextMenuProtection, type ContextMenuProtectionConfig } from "./modules/context-menu-protection";
import { KeyboardProtection, type KeyboardProtectionConfig } from "./modules/keyboard-protection";
import { DevToolsDetection, type DevToolsDetectionConfig } from "./modules/devtools-detection";
import { TextObfuscation, type TextObfuscationConfig } from "./modules/text-obfuscation";
import { LinkUrlHiding, type LinkUrlHidingConfig } from "./modules/link-url-hiding";
import { BrowserEnforcement, type BrowserEnforcementConfig } from "./modules/browser-enforcement";
import { ScreenshotDetection, type ScreenshotDetectionConfig } from "./modules/screenshot-detection";
import { Watermarking, type WatermarkingConfig } from "./modules/watermarking";
import { SelectionLimiting, type SelectionLimitingConfig } from "./modules/selection-limiting";

export interface ContentProtectionConfig {
  /** Global event callback — receives events from all modules */
  onEvent?: ProtectionEventCallback;

  /** Individual module configs. Omit a key to disable that module. */
  dragPrevention?: Omit<DragPreventionConfig, "onEvent">;
  printProtection?: Omit<PrintProtectionConfig, "onEvent">;
  copyProtection?: Omit<CopyProtectionConfig, "onEvent">;
  contextMenuProtection?: Omit<ContextMenuProtectionConfig, "onEvent">;
  keyboardProtection?: Omit<KeyboardProtectionConfig, "onEvent">;
  devToolsDetection?: Omit<DevToolsDetectionConfig, "onEvent">;
  textObfuscation?: Omit<TextObfuscationConfig, "onEvent">;
  linkUrlHiding?: LinkUrlHidingConfig;
  browserEnforcement?: Omit<BrowserEnforcementConfig, "onEvent">;
  screenshotDetection?: Omit<ScreenshotDetectionConfig, "onEvent">;
  watermarking?: WatermarkingConfig;
  selectionLimiting?: Omit<SelectionLimitingConfig, "onEvent">;
}

/**
 * Main orchestrator that initializes and manages all content protection modules.
 *
 * Usage:
 * ```ts
 * const protection = new ContentProtection({
 *   onEvent: (e) => console.log(e),
 *   dragPrevention: { contentElement: el, contentIframes: iframes },
 *   printProtection: { contentElement: el, protectedElements: [el, panel] },
 *   copyProtection: { contentElement: el, mode: "block" },
 *   // ... enable only what you need
 * });
 *
 * await protection.activate();
 * // later...
 * protection.deactivate();
 * ```
 */
export class ContentProtection {
  private modules: Map<string, ProtectionModule> = new Map();
  private config: ContentProtectionConfig;
  private eventLog: ProtectionEvent[] = [];

  constructor(config: ContentProtectionConfig) {
    this.config = config;
    this.initModules();
  }

  private initModules(): void {
    const onEvent = (event: ProtectionEvent) => {
      this.eventLog.push(event);
      this.config.onEvent?.(event);
    };

    if (this.config.dragPrevention) {
      this.modules.set("drag", new DragPrevention({ ...this.config.dragPrevention, onEvent }));
    }
    if (this.config.printProtection) {
      this.modules.set("print", new PrintProtection({ ...this.config.printProtection, onEvent }));
    }
    if (this.config.copyProtection) {
      this.modules.set("copy", new CopyProtection({ ...this.config.copyProtection, onEvent }));
    }
    if (this.config.contextMenuProtection) {
      this.modules.set("contextMenu", new ContextMenuProtection({ ...this.config.contextMenuProtection, onEvent }));
    }
    if (this.config.keyboardProtection) {
      this.modules.set("keyboard", new KeyboardProtection({ ...this.config.keyboardProtection, onEvent }));
    }
    if (this.config.devToolsDetection) {
      this.modules.set("devtools", new DevToolsDetection({ ...this.config.devToolsDetection, onEvent }));
    }
    if (this.config.textObfuscation) {
      this.modules.set("obfuscation", new TextObfuscation({ ...this.config.textObfuscation, onEvent }));
    }
    if (this.config.linkUrlHiding) {
      this.modules.set("linkHiding", new LinkUrlHiding(this.config.linkUrlHiding));
    }
    if (this.config.browserEnforcement) {
      this.modules.set("browser", new BrowserEnforcement({ ...this.config.browserEnforcement, onEvent }));
    }
    if (this.config.screenshotDetection) {
      this.modules.set("screenshot", new ScreenshotDetection({ ...this.config.screenshotDetection, onEvent }));
    }
    if (this.config.watermarking) {
      this.modules.set("watermark", new Watermarking(this.config.watermarking));
    }
    if (this.config.selectionLimiting) {
      this.modules.set("selection", new SelectionLimiting({ ...this.config.selectionLimiting, onEvent }));
    }
  }

  /** Activate all configured modules. Browser enforcement runs first (may throw). */
  async activate(): Promise<void> {
    // Browser check first — fail fast if unsupported
    const browser = this.modules.get("browser");
    if (browser) await browser.activate();

    // DevTools detection runs early
    const devtools = this.modules.get("devtools");
    if (devtools) await devtools.activate();

    // Activate everything else
    for (const [name, module] of this.modules) {
      if (name === "browser" || name === "devtools") continue;
      await module.activate();
    }
  }

  /** Deactivate all modules and restore original state */
  deactivate(): void {
    for (const module of this.modules.values()) {
      module.deactivate();
    }
  }

  /** Get a specific module instance for advanced control */
  getModule<T extends ProtectionModule>(name: string): T | undefined {
    return this.modules.get(name) as T | undefined;
  }

  /** Get the copy protection module (for citation bypass control) */
  get copyProtection(): CopyProtection | undefined {
    return this.modules.get("copy") as CopyProtection | undefined;
  }

  /** Get the text obfuscation module (for reinitialize on page turn) */
  get textObfuscation(): TextObfuscation | undefined {
    return this.modules.get("obfuscation") as TextObfuscation | undefined;
  }

  /** Get the watermarking module (for reinitialize on page turn) */
  get watermarking(): Watermarking | undefined {
    return this.modules.get("watermark") as Watermarking | undefined;
  }

  /** Get all logged protection events */
  getEventLog(): readonly ProtectionEvent[] {
    return this.eventLog;
  }

  /** Clear the event log */
  clearEventLog(): void {
    this.eventLog = [];
  }
}
