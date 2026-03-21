/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule } from "../types";

export interface WatermarkingConfig {
  /** The content root to apply watermarks to */
  contentRoot: HTMLElement;
  /** Unique identifier for the current user (used in watermark) */
  userId: string;
  /** Optional session or transaction ID */
  sessionId?: string;
  /** Watermark opacity (0-1, default: 0.02 — nearly invisible) */
  opacity?: number;
  /** Watermark text color (default: "#000000") */
  color?: string;
  /** Watermark font size in px (default: 14) */
  fontSize?: number;
  /** Rotation angle in degrees (default: -30) */
  rotation?: number;
  /** Also inject invisible zero-width characters into text (for copy tracing) */
  enableTextFingerprint?: boolean;
}

/**
 * Applies invisible watermarks to content for leak tracing.
 *
 * Two layers:
 * 1. Visual watermark: Near-invisible CSS overlay with user ID + timestamp.
 *    Survives screenshots and print-to-PDF. Visible when contrast is adjusted.
 * 2. Text fingerprint: Zero-width Unicode characters injected between words.
 *    Survives copy-paste. Can be decoded to identify the source user.
 */
export class Watermarking implements ProtectionModule {
  private config: WatermarkingConfig;
  private overlayElement: HTMLDivElement | null = null;
  private originalTexts: Map<Node, string> = new Map();

  constructor(config: WatermarkingConfig) {
    this.config = {
      opacity: 0.02,
      color: "#000000",
      fontSize: 14,
      rotation: -30,
      enableTextFingerprint: false,
      ...config,
    };
  }

  activate(): void {
    this.applyVisualWatermark();
    if (this.config.enableTextFingerprint) {
      this.applyTextFingerprint();
    }
  }

  deactivate(): void {
    this.overlayElement?.remove();
    this.overlayElement = null;

    // Restore original texts
    for (const [node, text] of this.originalTexts) {
      node.textContent = text;
    }
    this.originalTexts.clear();
  }

  /** Call when content changes (page turn, chapter navigation) */
  reinitialize(): void {
    this.originalTexts.clear();
    if (this.config.enableTextFingerprint) {
      this.applyTextFingerprint();
    }
  }

  private applyVisualWatermark(): void {
    const overlay = document.createElement("div");
    overlay.setAttribute("data-protection", "watermark");

    const watermarkText = this.buildWatermarkText();

    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 99999;
      overflow: hidden;
      opacity: ${this.config.opacity};
    `;

    // Create repeating pattern
    const patternSize = 300;
    const rows = Math.ceil(window.innerHeight / patternSize) + 1;
    const cols = Math.ceil(window.innerWidth / patternSize) + 1;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const span = document.createElement("span");
        span.textContent = watermarkText;
        span.style.cssText = `
          position: absolute;
          top: ${r * patternSize}px;
          left: ${c * patternSize}px;
          transform: rotate(${this.config.rotation}deg);
          color: ${this.config.color};
          font-size: ${this.config.fontSize}px;
          font-family: monospace;
          white-space: nowrap;
          user-select: none;
          -webkit-user-select: none;
        `;
        overlay.appendChild(span);
      }
    }

    this.config.contentRoot.appendChild(overlay);
    this.overlayElement = overlay;
  }

  private applyTextFingerprint(): void {
    const fingerprint = this.encodeFingerprint(this.config.userId);
    const textNodes = this.findTextNodes(this.config.contentRoot);

    for (const node of textNodes) {
      const original = node.textContent ?? "";
      if (!original.trim()) continue;

      this.originalTexts.set(node, original);

      // Insert fingerprint between words
      const words = original.split(" ");
      if (words.length < 2) continue;

      // Insert the fingerprint string between the first two words
      words[0] = words[0] + fingerprint;
      node.textContent = words.join(" ");
    }
  }

  /**
   * Encode a user ID as a sequence of zero-width characters.
   * Uses zero-width space (U+200B) for 0 and zero-width non-joiner (U+200C) for 1.
   */
  private encodeFingerprint(userId: string): string {
    const ZERO = "\u200B"; // zero-width space
    const ONE = "\u200C"; // zero-width non-joiner
    const SEP = "\u200D"; // zero-width joiner as separator

    let binary = "";
    for (let i = 0; i < userId.length; i++) {
      binary += userId.charCodeAt(i).toString(2).padStart(8, "0");
    }

    return (
      SEP +
      binary
        .split("")
        .map((b) => (b === "0" ? ZERO : ONE))
        .join("") +
      SEP
    );
  }

  /**
   * Decode a fingerprint back to a user ID.
   * Useful for analyzing leaked content.
   */
  static decodeFingerprint(text: string): string | null {
    const ZERO = "\u200B";
    const ONE = "\u200C";
    const SEP = "\u200D";

    const sepIndex = text.indexOf(SEP);
    if (sepIndex === -1) return null;

    const endIndex = text.indexOf(SEP, sepIndex + 1);
    if (endIndex === -1) return null;

    const encoded = text.substring(sepIndex + 1, endIndex);
    let binary = "";
    for (const char of encoded) {
      if (char === ZERO) binary += "0";
      else if (char === ONE) binary += "1";
    }

    // Convert binary back to characters
    let result = "";
    for (let i = 0; i < binary.length; i += 8) {
      const byte = binary.substring(i, i + 8);
      if (byte.length === 8) {
        result += String.fromCharCode(parseInt(byte, 2));
      }
    }

    return result || null;
  }

  private buildWatermarkText(): string {
    const parts = [this.config.userId];
    if (this.config.sessionId) parts.push(this.config.sessionId);
    parts.push(new Date().toISOString().split("T")[0]);
    return parts.join(" | ");
  }

  private findTextNodes(parent: Node, nodes: Node[] = []): Node[] {
    let child = parent.firstChild;
    while (child) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = (child as Element).nodeName.toLowerCase();
        if (!["script", "style", "noscript"].includes(tag)) {
          this.findTextNodes(child, nodes);
        }
      } else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
        nodes.push(child);
      }
      child = child.nextSibling;
    }
    return nodes;
  }
}
