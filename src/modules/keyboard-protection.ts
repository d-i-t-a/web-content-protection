/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule, CommonTargets, ProtectionEventCallback } from "../types";
import { type ListenerRecord, addListenerSafe, removeAllListeners, collectTargets, isMac } from "../utils";

export interface KeyboardProtectionConfig extends CommonTargets {
  /** Block Ctrl+S / Cmd+S (save page) — default true */
  blockSave?: boolean;
  /** Block Ctrl+U / Cmd+U (view source) — default true */
  blockViewSource?: boolean;
  /** Block Ctrl+Shift+I / Cmd+Opt+I (dev tools) — default true */
  blockDevToolsShortcut?: boolean;
  /** Block Ctrl+Shift+J / Cmd+Opt+J (console) — default true */
  blockConsoleShortcut?: boolean;
  /** Block F12 (dev tools) — default true */
  blockF12?: boolean;
  /** Additional key combinations to block: e.g. [{ key: "s", ctrl: true }] */
  customBlockedKeys?: Array<{
    key: string;
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    alt?: boolean;
  }>;
  onEvent?: ProtectionEventCallback;
}

export class KeyboardProtection implements ProtectionModule {
  private config: KeyboardProtectionConfig;
  private listeners: ListenerRecord[] = [];

  constructor(config: KeyboardProtectionConfig) {
    this.config = {
      blockSave: true,
      blockViewSource: true,
      blockDevToolsShortcut: true,
      blockConsoleShortcut: true,
      blockF12: true,
      ...config,
    };
  }

  activate(): void {
    const handler = (e: Event) => this.onKeyDown(e as KeyboardEvent);

    const targets = collectTargets(
      this.config.contentElement,
      this.config.additionalElements,
      this.config.contentIframes
    );

    for (const target of targets) {
      const rec = addListenerSafe(target, "keydown", handler, true);
      if (rec) this.listeners.push(rec);
    }
  }

  deactivate(): void {
    removeAllListeners(this.listeners);
  }

  private onKeyDown(e: KeyboardEvent): void | false {
    const mac = isMac();
    const ctrl = mac ? e.metaKey : e.ctrlKey;

    // Ctrl+S / Cmd+S — Save
    if (this.config.blockSave && ctrl && e.key === "s") {
      return this.block(e, "save");
    }

    // Ctrl+U / Cmd+U — View Source
    if (this.config.blockViewSource && ctrl && e.key === "u") {
      return this.block(e, "view-source");
    }

    // Ctrl+Shift+I / Cmd+Opt+I — DevTools
    if (this.config.blockDevToolsShortcut && ctrl && e.shiftKey && e.key === "I") {
      return this.block(e, "devtools");
    }
    if (this.config.blockDevToolsShortcut && mac && e.altKey && e.metaKey && e.key === "i") {
      return this.block(e, "devtools");
    }

    // Ctrl+Shift+J / Cmd+Opt+J — Console
    if (this.config.blockConsoleShortcut && ctrl && e.shiftKey && e.key === "J") {
      return this.block(e, "console");
    }
    if (this.config.blockConsoleShortcut && mac && e.altKey && e.metaKey && e.key === "j") {
      return this.block(e, "console");
    }

    // F12 — DevTools
    if (this.config.blockF12 && e.key === "F12") {
      return this.block(e, "F12");
    }

    // Custom blocked keys
    if (this.config.customBlockedKeys) {
      for (const combo of this.config.customBlockedKeys) {
        const ctrlMatch = combo.ctrl ? (mac ? e.metaKey : e.ctrlKey) : true;
        const metaMatch = combo.meta ? e.metaKey : true;
        const shiftMatch = combo.shift ? e.shiftKey : true;
        const altMatch = combo.alt ? e.altKey : true;
        if (e.key === combo.key && ctrlMatch && metaMatch && shiftMatch && altMatch) {
          return this.block(e, `custom:${combo.key}`);
        }
      }
    }
  }

  private block(e: KeyboardEvent, detail: string): false {
    e.preventDefault();
    e.stopPropagation();
    this.config.onEvent?.({ type: "key_blocked", timestamp: Date.now(), detail });
    return false;
  }
}
