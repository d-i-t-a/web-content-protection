/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule, CommonTargets, ProtectionEventCallback } from "../types";
import { type ListenerRecord, addListenerSafe, removeAllListeners, collectTargets } from "../utils";

export interface DragPreventionConfig extends CommonTargets {
  onEvent?: ProtectionEventCallback;
}

export class DragPrevention implements ProtectionModule {
  private config: DragPreventionConfig;
  private listeners: ListenerRecord[] = [];
  private styledElements: HTMLElement[] = [];

  constructor(config: DragPreventionConfig) {
    this.config = config;
  }

  activate(): void {
    const handler = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.config.onEvent?.({
        type: "drag_blocked",
        timestamp: Date.now(),
      });
      return false;
    };

    // Apply to all targets
    const targets = collectTargets(
      this.config.contentElement,
      this.config.additionalElements,
      this.config.contentIframes,
    );

    for (const target of targets) {
      for (const type of ["dragstart", "drag", "drop"]) {
        const rec = addListenerSafe(target, type, handler, true);
        if (rec) this.listeners.push(rec);
      }
    }

    // CSS-level drag prevention
    this.applyCss(this.config.contentElement);
    if (this.config.contentIframes) {
      for (const iframe of this.config.contentIframes) {
        try {
          const body = iframe.contentDocument?.body;
          if (body) this.applyCss(body);
        } catch {
          // cross-origin
        }
      }
    }
  }

  deactivate(): void {
    removeAllListeners(this.listeners);
    for (const el of this.styledElements) {
      el.style.removeProperty("-webkit-user-drag");
      el.style.removeProperty("user-drag");
    }
    this.styledElements = [];
  }

  private applyCss(el: HTMLElement): void {
    el.style.setProperty("-webkit-user-drag", "none");
    el.style.setProperty("user-drag", "none");
    this.styledElements.push(el);
    // Disable image dragging
    el.querySelectorAll("img").forEach((img) => {
      img.setAttribute("draggable", "false");
    });
  }
}
