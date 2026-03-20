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
  /** Document-relative top position (stable across scroll) */
  offsetTop: number;
  /** Approximate height */
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
  private measureRange: Range | null = null;
  private excludeSet: Set<string>;

  constructor(config: TextObfuscationConfig) {
    this.config = {
      excludeNodes: ["script", "style", "option", "noscript", "textarea", "code", "pre"],
      viewportPadding: 50,
      ...config,
    };
    this.excludeSet = new Set(this.config.excludeNodes!.map((n) => n.toLowerCase()));
    this.scrollHandler = () => this.scheduleUpdate();
    this.resizeHandler = () => {
      this.remeasurePositions();
      this.scheduleUpdate();
    };
  }

  activate(): void {
    // Security sentinel — if its style is tampered with, flag as hacked
    this.securityContainer = document.createElement("div");
    this.securityContainer.setAttribute("data-protection", "sentinel");
    this.config.contentRoot.appendChild(this.securityContainer);
    // Remove any style attribute the browser may have added
    this.securityContainer.removeAttribute("style");

    // Listen for scroll/resize
    this.config.scrollContainer.addEventListener("scroll", this.scrollHandler, { passive: true });
    window.addEventListener("resize", this.resizeHandler, { passive: true });

    // Delay rect scanning until after layout stabilizes (fonts loaded, flex computed)
    requestAnimationFrame(() => {
      this.rects = this.findRects(this.config.contentRoot);
      this.updateAllRects();
      // Start mutation observer after initial scramble to avoid false positives
      this.startMutationObserver();
    });
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
    if (this.measureRange) {
      this.measureRange.detach();
      this.measureRange = null;
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
    this.remeasurePositions();
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

    // Determine the visible scroll range in document-relative coordinates
    // scrollTop = how far the container is scrolled
    // clientHeight = visible height of the container
    const container = this.config.scrollContainer;
    const scrollTop = container.scrollTop;
    const viewportHeight = container.clientHeight;
    const pad = this.config.viewportPadding ?? 50;

    // Visible range in document-relative space
    const visibleTop = scrollTop - pad;
    const visibleBottom = scrollTop + viewportHeight + pad;

    // Disconnect mutation observer during our own updates to prevent
    // the observer from re-scrambling text we're intentionally unscrambling
    this.mutationObserver?.disconnect();
    for (const rect of this.rects) {
      const nodeBottom = rect.offsetTop + rect.height;
      const outside = nodeBottom < visibleTop || rect.offsetTop > visibleBottom;

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
    this.reconnectMutationObserver();
  }

  private isBeingHacked(element: HTMLElement): boolean {
    // Only flag as hacked if the sentinel has meaningful style changes
    // (not just an empty or whitespace-only style attribute)
    const style = element.getAttribute("style");
    const hasRealStyle = !!style && style.trim().length > 0;
    return !!(
      element.style.animation ||
      element.style.transition ||
      element.style.position ||
      hasRealStyle
    );
  }

  /**
   * Measure all text node positions once.
   * Positions are stored as offsets relative to the scroll container's
   * scrollable area (i.e., document-relative, not viewport-relative).
   * This way, scroll updates only need scrollTop — no per-node measurement.
   */
  private findRects(parent: HTMLElement): ObfuscationRect[] {
    const textNodes = this.findTextNodes(parent);
    const containerRect = this.config.scrollContainer.getBoundingClientRect();
    const scrollTop = this.config.scrollContainer.scrollTop;

    return textNodes.map((node) => {
      const parentTag = (node.parentElement?.nodeName ?? "").toLowerCase();
      const shouldExclude = this.excludeSet.has(parentTag);
      const text = node.textContent ?? "";
      const scrambled = shouldExclude ? text : this.scramble(text);
      const bounds = this.measureTextNode(node);

      // Convert viewport-relative position to document-relative
      // by adding scrollTop and subtracting container's viewport offset
      const offsetTop = bounds.top - containerRect.top + scrollTop;

      return {
        node,
        textContent: text,
        scrambledTextContent: scrambled,
        isObfuscated: false,
        offsetTop,
        height: bounds.height,
      };
    });
  }

  /** Re-measure all positions (on resize/layout change) without re-finding nodes */
  private remeasurePositions(): void {
    const containerRect = this.config.scrollContainer.getBoundingClientRect();
    const scrollTop = this.config.scrollContainer.scrollTop;

    for (const rect of this.rects) {
      const bounds = this.measureTextNode(rect.node);
      rect.offsetTop = bounds.top - containerRect.top + scrollTop;
      rect.height = bounds.height;
    }
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
      if (!this.measureRange) {
        this.measureRange = document.createRange();
      }
      this.measureRange.selectNode(node);
      return this.measureRange.getBoundingClientRect();
    } catch {
      return new DOMRect(0, 0, 0, 0);
    }
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

        // Someone un-scrambled a tracked text node externally
        if (mutation.type === "characterData") {
          const rect = this.rects.find((r) => r.node === mutation.target);
          if (rect && rect.isObfuscated) {
            rect.node.textContent = rect.scrambledTextContent;
          }
        }
      }
    });

    this.reconnectMutationObserver();
  }

  private reconnectMutationObserver(): void {
    this.mutationObserver?.observe(this.config.contentRoot, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style"],
    });
  }
}
