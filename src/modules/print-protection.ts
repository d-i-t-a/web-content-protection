/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule, CommonTargets, ProtectionEventCallback } from "../types";
import { type ListenerRecord, addListenerSafe, removeAllListeners, isMac } from "../utils";

export interface PrintProtectionConfig extends CommonTargets {
  onEvent?: ProtectionEventCallback;
}

export class PrintProtection implements ProtectionModule {
  private config: PrintProtectionConfig;
  private listeners: ListenerRecord[] = [];
  private styleElements: HTMLStyleElement[] = [];

  constructor(config: PrintProtectionConfig) {
    this.config = config;
  }

  activate(): void {
    // Inject @media print CSS into main document and all iframes
    this.styleElements.push(this.injectPrintCss(document));
    if (this.config.contentIframes) {
      for (const iframe of this.config.contentIframes) {
        try {
          const doc = iframe.contentDocument;
          if (doc) this.styleElements.push(this.injectPrintCss(doc));
        } catch {
          // cross-origin
        }
      }
    }

    // beforeprint / afterprint events
    const beforeHandler = (e: Event) => {
      this.onBeforePrint();
      e.preventDefault?.();
      e.stopPropagation?.();
      this.config.onEvent?.({ type: "print_blocked", timestamp: Date.now() });
      return false;
    };
    const afterHandler = () => this.onAfterPrint();

    // Attach to window + all iframe windows
    const windows: EventTarget[] = [window];
    if (this.config.contentIframes) {
      for (const iframe of this.config.contentIframes) {
        try {
          if (iframe.contentWindow) windows.push(iframe.contentWindow);
        } catch {
          // cross-origin
        }
      }
    }

    for (const win of windows) {
      const r1 = addListenerSafe(win, "beforeprint", beforeHandler);
      const r2 = addListenerSafe(win, "afterprint", afterHandler);
      if (r1) this.listeners.push(r1);
      if (r2) this.listeners.push(r2);
    }

    // Block Ctrl+P / Cmd+P
    const keyHandler = (e: Event) => {
      const ke = e as KeyboardEvent;
      const modifier = isMac() ? ke.metaKey : ke.ctrlKey;
      if (modifier && ke.key === "p") {
        ke.preventDefault();
        ke.stopPropagation();
        this.config.onEvent?.({ type: "print_blocked", timestamp: Date.now(), detail: "keyboard" });
      }
    };
    const r = addListenerSafe(document, "keydown", keyHandler, true);
    if (r) this.listeners.push(r);

    if (this.config.contentIframes) {
      for (const iframe of this.config.contentIframes) {
        try {
          const doc = iframe.contentDocument;
          if (doc) {
            const r2 = addListenerSafe(doc, "keydown", keyHandler, true);
            if (r2) this.listeners.push(r2);
          }
        } catch {
          // cross-origin
        }
      }
    }
  }

  deactivate(): void {
    removeAllListeners(this.listeners);
    for (const style of this.styleElements) {
      style.remove();
    }
    this.styleElements = [];
  }

  private injectPrintCss(doc: Document): HTMLStyleElement {
    const style = doc.createElement("style");
    style.setAttribute("data-protection", "print");
    style.textContent = `
      @media print {
        body, body * {
          visibility: hidden !important;
          display: none !important;
        }
      }
    `;
    doc.head.appendChild(style);
    return style;
  }

  private onBeforePrint(): void {
    const elements = [this.config.contentElement, ...(this.config.additionalElements ?? [])];
    for (const el of elements) {
      el.style.setProperty("display", "none", "important");
      el.style.setProperty("visibility", "hidden", "important");
    }
  }

  private onAfterPrint(): void {
    const elements = [this.config.contentElement, ...(this.config.additionalElements ?? [])];
    for (const el of elements) {
      el.style.removeProperty("display");
      el.style.removeProperty("visibility");
    }
  }
}
