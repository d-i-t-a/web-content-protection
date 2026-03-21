/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule, CommonTargets, ProtectionEventCallback } from "../types";
import { type ListenerRecord, addListenerSafe, removeAllListeners, collectTargets } from "../utils";

export interface ContextMenuProtectionConfig extends CommonTargets {
  onEvent?: ProtectionEventCallback;
}

export class ContextMenuProtection implements ProtectionModule {
  private config: ContextMenuProtectionConfig;
  private listeners: ListenerRecord[] = [];

  constructor(config: ContextMenuProtectionConfig) {
    this.config = config;
  }

  activate(): void {
    const handler = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.config.onEvent?.({ type: "context_menu_blocked", timestamp: Date.now() });
      return false;
    };

    const targets = collectTargets(
      this.config.contentElement,
      this.config.additionalElements,
      this.config.contentIframes,
    );

    for (const target of targets) {
      const rec = addListenerSafe(target, "contextmenu", handler, true);
      if (rec) this.listeners.push(rec);
    }
  }

  deactivate(): void {
    removeAllListeners(this.listeners);
  }
}
