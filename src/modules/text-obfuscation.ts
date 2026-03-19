/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule, ProtectionEventCallback } from "../types";

export interface TextObfuscationConfig {
  /** The scrollable container that holds book content */
  scrollContainer: HTMLElement;
  /** The content root to find text nodes in (e.g., iframe body) */
  contentRoot: HTMLElement;
  /** HTML tag names to exclude from obfuscation */
  excludeNodes?: string[];
  /** Extra viewport padding in pixels — unscramble slightly before visible */
  viewportPadding?: number;
  onEvent?: ProtectionEventCallback;
}

interface ObfuscationRect {
  node: Node;
  textContent: string;
  scrambledTextContent: string;
  isObfuscated: boolean;
  top: number;
  left: number;
  width: number;
  height: number;
}

export class TextObfuscation implements ProtectionModule {
  private config: TextObfuscationConfig;
  private rects: ObfuscationRect[] = [];
  private mutationObserver: MutationObserver | null = null;
  private scrollHandler: () => void;
  private resizeHandler: () => void;
  private isHacked = false;
  private securityContainer: HTMLDivElement | null = null;
  private rafId: number | null = null;
  private excludeSet: Set<string>;

  constructor(config: TextObfuscationConfig) {
    this.config = {
      excludeNodes: ["script", "style", "option", "noscript", "textarea", "code", "pre"],
      viewportPadding: 50,
      ...config,
    };
    this.excludeSet = new Set(this.config.excludeNodes!.map((n) => n.toLowerCase()));
    this.scrollHandler = () => this.scheduleUpdate();
    this.resizeHandler = () => this.scheduleUpdate();
  }

  activate(): void {
    // Security sentinel — if its style is tampered with, flag as hacked
    this.securityContainer = document.createElement("div");
    this.securityContainer.setAttribute("data-protection", "sentinel");
    this.securityContainer.style.cssText = "";
    this.config.contentRoot.appendChild(this.securityContainer);

    // Build obfuscation rects
    this.rects = this.findRects(this.config.contentRoot);
    this.updateAllRects();

    // Listen for scroll/resize
    this.config.scrollContainer.addEventListener("scroll", this.scrollHandler, { passive: true });
    window.addEventListener("resize", this.resizeHandler, { passive: true });

    // Watch for DOM tampering
    this.startMutationObserver();
  }

  deactivate(): void {
    // Restore all original text
    for (const rect of this.rects) {
      if (rect.isObfuscated) {
        rect.node.textContent = rect.textContent;
        rect.isObfuscated = false;
      }
    }
    this.rects = [];
    this.isHacked = false;

    this.config.scrollContainer.removeEventListener("scroll", this.scrollHandler);
    window.removeEventListener("resize", this.resizeHandler);
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    this.securityContainer?.remove();
    this.securityContainer = null;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /** Call when content changes (page turn, chapter navigation) */
  reinitialize(): void {
    for (const rect of this.rects) {
      if (rect.isObfuscated) {
        rect.node.textContent = rect.textContent;
      }
    }
    this.rects = this.findRects(this.config.contentRoot);
    this.updateAllRects();
  }

  /** Recalculate positions after layout changes (font size, window resize) */
  recalculate(): void {
    for (const rect of this.rects) {
      const bounds = this.measureTextNode(rect.node);
      rect.top = bounds.top;
      rect.left = bounds.left;
      rect.width = bounds.width;
      rect.height = bounds.height;
    }
    this.updateAllRects();
  }

  private scheduleUpdate(): void {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.updateAllRects();
    });
  }

  private updateAllRects(): void {
    const hacked = this.securityContainer ? this.isBeingHacked(this.securityContainer) : false;
    if (hacked && !this.isHacked) {
      this.isHacked = true;
      this.config.onEvent?.({ type: "tamper_detected", timestamp: Date.now() });
    }

    for (const rect of this.rects) {
      this.toggleRect(rect, hacked);
    }
  }

  private toggleRect(rect: ObfuscationRect, hacked: boolean): void {
    const outside = this.isOutsideViewport(rect);

    // Unscramble: in viewport and not tampered
    if (rect.isObfuscated && !outside && !hacked && !this.isHacked) {
      rect.node.textContent = rect.textContent;
      rect.isObfuscated = false;
    }

    // Scramble: outside viewport or tampered
    if (!rect.isObfuscated && (outside || hacked || this.isHacked)) {
      rect.node.textContent = rect.scrambledTextContent;
      rect.isObfuscated = true;
    }
  }

  private isOutsideViewport(rect: ObfuscationRect): boolean {
    const c = this.config.scrollContainer;
    const pad = this.config.viewportPadding ?? 50;

    // Account for line height for smoother transitions
    const lineHeight = this.getLineHeight(rect.node);

    const windowLeft = c.scrollLeft;
    const windowRight = windowLeft + c.clientWidth;
    const windowTop = c.scrollTop - lineHeight;
    const windowBottom = windowTop + c.clientHeight + lineHeight + pad;

    const right = rect.left + rect.width;
    const bottom = rect.top + rect.height;

    const isAbove = bottom < windowTop;
    const isBelow = rect.top > windowBottom;
    // Wider horizontal margins for paginated content
    const isLeft = right < windowLeft - window.innerWidth;
    const isRight = rect.left > windowRight + window.innerWidth;

    return isAbove || isBelow || isLeft || isRight;
  }

  private isBeingHacked(element: HTMLElement): boolean {
    return !!(
      element.style.animation ||
      element.style.transition ||
      element.style.position ||
      element.hasAttribute("style")
    );
  }

  private findRects(parent: HTMLElement): ObfuscationRect[] {
    const textNodes = this.findTextNodes(parent);
    return textNodes.map((node) => {
      const parentTag = (node.parentElement?.nodeName ?? "").toLowerCase();
      const shouldExclude = this.excludeSet.has(parentTag);
      const text = node.textContent ?? "";
      const scrambled = shouldExclude ? text : this.scramble(text);
      const bounds = this.measureTextNode(node);

      return {
        node,
        textContent: text,
        scrambledTextContent: scrambled,
        isObfuscated: false,
        top: bounds.top,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height,
      };
    });
  }

  private findTextNodes(parent: Node, nodes: Node[] = []): Node[] {
    let child = parent.firstChild;
    while (child) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        this.findTextNodes(child, nodes);
      } else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
        nodes.push(child);
      }
      child = child.nextSibling;
    }
    return nodes;
  }

  private measureTextNode(node: Node): DOMRect {
    try {
      const range = document.createRange();
      range.selectNode(node);
      const rect = range.getBoundingClientRect();
      range.detach();
      return rect;
    } catch {
      return new DOMRect(0, 0, 0, 0);
    }
  }

  private getLineHeight(node: Node): number {
    try {
      if (node.parentElement) {
        return parseInt(getComputedStyle(node.parentElement).lineHeight.replace("px", "")) || 10;
      }
    } catch {
      // ignore
    }
    return 10;
  }

  /** Scramble text by shuffling characters within each word */
  private scramble(text: string): string {
    return text
      .split(" ")
      .map((word) => {
        // Keep hyphenated words and short words intact
        if (word.includes("-") || word.length <= 2) return word;
        const chars = word.split("");
        for (let i = chars.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [chars[i], chars[j]] = [chars[j], chars[i]];
        }
        return chars.join("");
      })
      .join(" ");
  }

  private startMutationObserver(): void {
    this.mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Security sentinel tampered with
        if (
          mutation.target === this.securityContainer ||
          mutation.target.parentElement === this.securityContainer
        ) {
          this.isHacked = true;
          this.config.onEvent?.({ type: "tamper_detected", timestamp: Date.now(), detail: "sentinel" });
          this.updateAllRects();
          return;
        }

        // Someone un-scrambled a tracked text node
        if (mutation.type === "characterData") {
          const rect = this.rects.find((r) => r.node === mutation.target);
          if (rect && rect.isObfuscated) {
            rect.node.textContent = rect.scrambledTextContent;
          }
        }
      }
    });

    this.mutationObserver.observe(this.config.contentRoot, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style"],
    });
  }
}
