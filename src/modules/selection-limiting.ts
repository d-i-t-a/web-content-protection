/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule, CommonTargets, ProtectionEventCallback } from "../types";
import { type ListenerRecord, addListenerSafe, removeAllListeners } from "../utils";

export interface SelectionLimitingConfig extends CommonTargets {
  /** Maximum characters that can be selected at once */
  maxSelectionLength: number;
  /** Whether to collapse selection or truncate it when limit is exceeded */
  behavior: "collapse" | "truncate";
  onEvent?: ProtectionEventCallback;
}

/**
 * Limits how much text can be selected at once.
 * Prevents bulk text extraction via select-all or large drag selections.
 * Different from CopyProtection — this limits SELECTION, not clipboard.
 */
export class SelectionLimiting implements ProtectionModule {
  private config: SelectionLimitingConfig;
  private listeners: ListenerRecord[] = [];
  private checking = false;

  constructor(config: SelectionLimitingConfig) {
    this.config = config;
  }

  activate(): void {
    const handler = () => this.checkSelection();

    // Listen on all relevant documents
    const rec = addListenerSafe(document, "selectionchange", handler);
    if (rec) this.listeners.push(rec);

    if (this.config.contentIframes) {
      for (const iframe of this.config.contentIframes) {
        try {
          const doc = iframe.contentDocument;
          if (doc) {
            const r = addListenerSafe(doc, "selectionchange", handler);
            if (r) this.listeners.push(r);
          }
        } catch {
          // cross-origin
        }
      }
    }
  }

  deactivate(): void {
    removeAllListeners(this.listeners);
  }

  private checkSelection(): void {
    if (this.checking) return;
    this.checking = true;

    try {
      // Check main document
      this.enforceLimit(document);

      // Check iframes
      if (this.config.contentIframes) {
        for (const iframe of this.config.contentIframes) {
          try {
            const doc = iframe.contentDocument;
            if (doc) this.enforceLimit(doc);
          } catch {
            // cross-origin
          }
        }
      }
    } finally {
      this.checking = false;
    }
  }

  private enforceLimit(doc: Document): void {
    const selection = doc.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString();
    if (text.length <= this.config.maxSelectionLength) return;

    if (this.config.behavior === "collapse") {
      selection.collapseToStart();
    } else if (this.config.behavior === "truncate") {
      // Walk the selection range and trim to maxSelectionLength
      try {
        const range = selection.getRangeAt(0);
        this.truncateRange(range, doc, this.config.maxSelectionLength);
      } catch {
        // Fallback: collapse
        selection.collapseToStart();
      }
    }

    this.config.onEvent?.({
      type: "copy_blocked",
      timestamp: Date.now(),
      detail: `selection exceeded ${this.config.maxSelectionLength} chars (was ${text.length})`,
    });
  }

  private truncateRange(range: Range, doc: Document, maxChars: number): void {
    // Create a tree walker starting from the range start
    const walker = doc.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);

    let charCount = 0;
    let node = walker.nextNode();

    while (node) {
      const text = node.textContent ?? "";
      if (charCount + text.length > maxChars) {
        // This is the node where we need to cut
        const remaining = maxChars - charCount;
        range.setEnd(node, remaining);
        return;
      }
      charCount += text.length;
      node = walker.nextNode();
    }
  }
}
