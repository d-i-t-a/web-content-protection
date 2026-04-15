/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule, ProtectionEvent, ProtectionEventCallback } from "./types";
import { DragPrevention, type DragPreventionConfig } from "./modules/drag-prevention";
import { PrintProtection, type PrintProtectionConfig } from "./modules/print-protection";
import { CopyProtection, type CopyProtectionConfig } from "./modules/copy-protection";
import {
  ContextMenuProtection,
  type ContextMenuProtectionConfig,
} from "./modules/context-menu-protection";
import { KeyboardProtection, type KeyboardProtectionConfig } from "./modules/keyboard-protection";
import { DevToolsDetection, type DevToolsDetectionConfig } from "./modules/devtools-detection";
import { TextObfuscation, type TextObfuscationConfig } from "./modules/text-obfuscation";
import { LinkUrlHiding, type LinkUrlHidingConfig } from "./modules/link-url-hiding";
import { BrowserEnforcement, type BrowserEnforcementConfig } from "./modules/browser-enforcement";
import {
  ScreenshotDetection,
  type ScreenshotDetectionConfig,
} from "./modules/screenshot-detection";
import { Watermarking, type WatermarkingConfig } from "./modules/watermarking";
import { SelectionLimiting, type SelectionLimitingConfig } from "./modules/selection-limiting";
import { ImageProtection, type ImageProtectionConfig } from "./modules/image-protection";
import { AntiAutomation, type AntiAutomationConfig } from "./modules/anti-automation";
import {
  SpeechSynthesisBlocking,
  type SpeechSynthesisBlockingConfig,
} from "./modules/speech-synthesis-blocking";
import { ContentExpiration, type ContentExpirationConfig } from "./modules/content-expiration";
import { MediaProtection, type MediaProtectionConfig } from "./modules/media-protection";
import {
  MediaStreamProtection,
  type MediaStreamProtectionConfig,
} from "./modules/media-stream-protection";
import { TamperDetection, type TamperDetectionConfig } from "./modules/tamper-detection";

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
  imageProtection?: Omit<ImageProtectionConfig, "onEvent">;
  antiAutomation?: Omit<AntiAutomationConfig, "onEvent">;
  speechSynthesisBlocking?: Omit<SpeechSynthesisBlockingConfig, "onEvent">;
  contentExpiration?: Omit<ContentExpirationConfig, "onEvent">;
  mediaProtection?: Omit<MediaProtectionConfig, "onEvent">;
  mediaStreamProtection?: Omit<MediaStreamProtectionConfig, "onEvent">;
  tamperDetection?: Omit<TamperDetectionConfig, "onEvent">;
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

      // DevTools detected — permanently scramble all text
      if (event.type === "devtools_detected") {
        this.textObfuscation?.scrambleAll();
      }
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
      this.modules.set(
        "contextMenu",
        new ContextMenuProtection({ ...this.config.contextMenuProtection, onEvent }),
      );
    }
    if (this.config.keyboardProtection) {
      this.modules.set(
        "keyboard",
        new KeyboardProtection({ ...this.config.keyboardProtection, onEvent }),
      );
    }
    if (this.config.devToolsDetection) {
      this.modules.set(
        "devtools",
        new DevToolsDetection({ ...this.config.devToolsDetection, onEvent }),
      );
    }
    if (this.config.textObfuscation) {
      this.modules.set(
        "obfuscation",
        new TextObfuscation({ ...this.config.textObfuscation, onEvent }),
      );
    }
    if (this.config.linkUrlHiding) {
      this.modules.set("linkHiding", new LinkUrlHiding(this.config.linkUrlHiding));
    }
    if (this.config.browserEnforcement) {
      this.modules.set(
        "browser",
        new BrowserEnforcement({ ...this.config.browserEnforcement, onEvent }),
      );
    }
    if (this.config.screenshotDetection) {
      this.modules.set(
        "screenshot",
        new ScreenshotDetection({ ...this.config.screenshotDetection, onEvent }),
      );
    }
    if (this.config.watermarking) {
      this.modules.set("watermark", new Watermarking(this.config.watermarking));
    }
    if (this.config.selectionLimiting) {
      this.modules.set(
        "selection",
        new SelectionLimiting({ ...this.config.selectionLimiting, onEvent }),
      );
    }
    if (this.config.imageProtection) {
      this.modules.set("image", new ImageProtection({ ...this.config.imageProtection, onEvent }));
    }
    if (this.config.antiAutomation) {
      this.modules.set(
        "automation",
        new AntiAutomation({ ...this.config.antiAutomation, onEvent }),
      );
    }
    if (this.config.speechSynthesisBlocking) {
      this.modules.set(
        "speech",
        new SpeechSynthesisBlocking({ ...this.config.speechSynthesisBlocking, onEvent }),
      );
    }
    if (this.config.contentExpiration) {
      this.modules.set(
        "expiration",
        new ContentExpiration({ ...this.config.contentExpiration, onEvent }),
      );
    }
    if (this.config.mediaProtection) {
      this.modules.set("media", new MediaProtection({ ...this.config.mediaProtection, onEvent }));
    }
    if (this.config.mediaStreamProtection) {
      this.modules.set(
        "mediaStream",
        new MediaStreamProtection({ ...this.config.mediaStreamProtection, onEvent }),
      );
    }
    if (this.config.tamperDetection) {
      this.modules.set("tamper", new TamperDetection({ ...this.config.tamperDetection, onEvent }));
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

  /** Get the content expiration module (for extend/remaining control) */
  get contentExpiration(): ContentExpiration | undefined {
    return this.modules.get("expiration") as ContentExpiration | undefined;
  }

  /** Get the anti-automation module (for manual detection) */
  get antiAutomation(): AntiAutomation | undefined {
    return this.modules.get("automation") as AntiAutomation | undefined;
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
