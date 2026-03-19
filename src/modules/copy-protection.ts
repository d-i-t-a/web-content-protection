/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule, CommonTargets, ProtectionEventCallback } from "../types";
import { type ListenerRecord, addListenerSafe, removeAllListeners, collectTargets, isMac } from "../utils";

export interface CopyProtectionConfig extends CommonTargets {
  /** "block" prevents all copying; "restrict" allows up to maxCharacters */
  mode: "block" | "restrict";
  /** Maximum characters allowed when mode is "restrict" */
  maxCharacters?: number;
  /** Message placed in clipboard when copy is fully blocked */
  blockedMessage?: string;
  /** Also intercept cut events */
  blockCut?: boolean;
  /** Allow citation bypass (temporarily enable copy for specific workflows) */
  citationBypass?: boolean;
  onEvent?: ProtectionEventCallback;
}

export class CopyProtection implements ProtectionModule {
  private config: CopyProtectionConfig;
  private listeners: ListenerRecord[] = [];
  private _citationActive = false;

  constructor(config: CopyProtectionConfig) {
    this.config = {
      blockedMessage: "",
      blockCut: true,
      citationBypass: false,
      ...config,
    };
  }

  /** Temporarily allow copying for citation workflows */
  set citationMode(active: boolean) {
    this._citationActive = active;
  }

  get citationMode(): boolean {
    return this._citationActive;
  }

  activate(): void {
    const targets = collectTargets(
      this.config.contentElement,
      this.config.additionalElements,
      this.config.contentIframes
    );

    const copyHandler = (e: Event) => this.onCopy(e as ClipboardEvent);
    const keyHandler = (e: Event) => this.onCopyKey(e as KeyboardEvent);

    for (const target of targets) {
      let rec = addListenerSafe(target, "copy", copyHandler, true);
      if (rec) this.listeners.push(rec);

      if (this.config.blockCut) {
        rec = addListenerSafe(target, "cut", copyHandler, true);
        if (rec) this.listeners.push(rec);
      }

      rec = addListenerSafe(target, "keydown", keyHandler, true);
      if (rec) this.listeners.push(rec);
    }
  }

  deactivate(): void {
    removeAllListeners(this.listeners);
  }

  private onCopy(event: ClipboardEvent): void | false {
    if (this.config.citationBypass && this._citationActive) return;

    if (this.config.mode === "block") {
      event.preventDefault();
      event.stopPropagation();
      event.clipboardData?.setData("text/plain", this.config.blockedMessage ?? "");
      this.config.onEvent?.({ type: "copy_blocked", timestamp: Date.now() });
      return false;
    }

    if (this.config.mode === "restrict") {
      event.preventDefault();
      event.stopPropagation();
      const selection = this.getSelectionText(event.target);
      const maxChars = this.config.maxCharacters ?? 0;
      const trimmed = selection.substring(0, maxChars);

      if (event.clipboardData) {
        event.clipboardData.setData("text/plain", trimmed);
      } else {
        this.fallbackCopy(trimmed);
      }

      this.config.onEvent?.({
        type: "copy_restricted",
        timestamp: Date.now(),
        detail: `${selection.length} chars → ${trimmed.length} chars`,
      });
      return false;
    }
  }

  private onCopyKey(event: KeyboardEvent): void | false {
    const modifier = isMac() ? event.metaKey : event.ctrlKey;
    if (!modifier) return;

    if (event.key === "c" || event.key === "x") {
      if (this.config.citationBypass && this._citationActive) return;

      if (this.config.mode === "block") {
        event.preventDefault();
        event.stopPropagation();
        this.config.onEvent?.({ type: "copy_blocked", timestamp: Date.now(), detail: "keyboard" });
        return false;
      }

      // In restrict mode, we let the copy event fire so the copyHandler trims
    }

    // Block select-all in block mode to prevent easy selection + drag
    if (this.config.mode === "block" && event.key === "a") {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
  }

  private getSelectionText(target: EventTarget | null): string {
    try {
      if (target instanceof HTMLElement) {
        const doc = target.ownerDocument;
        return doc?.getSelection()?.toString() ?? "";
      }
    } catch {
      // ignore
    }
    return window.getSelection()?.toString() ?? "";
  }

  private fallbackCopy(text: string): void {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}
