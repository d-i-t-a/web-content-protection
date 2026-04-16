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
  /** Optional iframes containing content to obfuscate */
  contentIframes?: HTMLIFrameElement[];
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
  /** Document-relative top position (stable across scroll) — used for main document nodes only */
  offsetTop: number;
  /** Approximate height */
  height: number;
  /** The iframe this node belongs to (null for main document nodes) */
  iframe: HTMLIFrameElement | null;
}

export class TextObfuscation implements ProtectionModule {
  private config: TextObfuscationConfig;
  private rects: ObfuscationRect[] = [];
  private mutationObserver: MutationObserver | null = null;
  private iframeObservers: MutationObserver[] = [];
  private scrollHandler: () => void;
  private resizeHandler: () => void;
  private iframeScrollListeners: Array<{ target: EventTarget; handler: () => void }> = [];
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

    // Listen for scroll/resize on the outer container
    this.config.scrollContainer.addEventListener("scroll", this.scrollHandler, { passive: true });
    window.addEventListener("resize", this.resizeHandler, { passive: true });

    // Listen for scroll inside iframes
    this.listenIframeScroll();

    // Delay rect scanning until after layout stabilizes (fonts loaded, flex computed)
    requestAnimationFrame(() => {
      this.rects = this.buildRects(this.config.contentRoot, null);
      this.buildIframeRects();
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
    for (const { target, handler } of this.iframeScrollListeners) {
      target.removeEventListener("scroll", handler);
    }
    this.iframeScrollListeners = [];
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    for (const obs of this.iframeObservers) {
      obs.disconnect();
    }
    this.iframeObservers = [];
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
    this.rects = this.buildRects(this.config.contentRoot, null);
    this.buildIframeRects();
    this.updateAllRects();
  }

  /** Permanently scramble all text. Cannot be undone without page refresh. */
  scrambleAll(): void {
    this.isHacked = true;
    this.mutationObserver?.disconnect();
    for (const obs of this.iframeObservers) {
      obs.disconnect();
    }
    for (const rect of this.rects) {
      if (!rect.isObfuscated) {
        rect.node.textContent = rect.scrambledTextContent;
        rect.isObfuscated = true;
      }
    }
    this.reconnectMutationObserver();
    this.reconnectIframeObservers();
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

    const pad = this.config.viewportPadding ?? 50;

    // Use scrollContainer's SCREEN-SPACE rect as the visible viewport for ALL nodes.
    // Iframe nodes are translated from iframe-local to screen space via iframe offset.
    // This handles any layout — scroll, translateX, translateY, transforms.
    const container = this.config.scrollContainer;
    const containerScreenRect = container.getBoundingClientRect();
    const containerScreenLeft = containerScreenRect.left - pad;
    const containerScreenRight = containerScreenRect.right + pad;
    const containerScreenTop = containerScreenRect.top - pad;
    const containerScreenBottom = containerScreenRect.bottom + pad;

    // Disconnect mutation observers during our own updates
    this.mutationObserver?.disconnect();
    for (const obs of this.iframeObservers) {
      obs.disconnect();
    }

    // Cache iframe screen positions (so we don't recompute per node)
    const iframeOffsets = new Map<HTMLIFrameElement, { left: number; top: number }>();
    if (this.config.contentIframes) {
      for (const iframe of this.config.contentIframes) {
        try {
          const r = iframe.getBoundingClientRect();
          iframeOffsets.set(iframe, { left: r.left, top: r.top });
        } catch {
          // cross-origin
        }
      }
    }

    for (const rect of this.rects) {
      let outside: boolean;

      if (rect.iframe) {
        // Iframe node bounds are relative to iframe's viewport.
        // Add iframe screen offset to get screen-space coords.
        // Then check overlap with scrollContainer's screen rect.
        const off = iframeOffsets.get(rect.iframe);
        if (off) {
          const bounds = this.measureTextNode(rect.node);
          const screenLeft = bounds.left + off.left;
          const screenRight = bounds.right + off.left;
          const screenTop = bounds.top + off.top;
          const screenBottom = bounds.bottom + off.top;
          outside =
            screenRight < containerScreenLeft ||
            screenLeft > containerScreenRight ||
            screenBottom < containerScreenTop ||
            screenTop > containerScreenBottom;
        } else {
          outside = true;
        }
      } else {
        // Main document nodes: live measure node bounds in screen space and
        // check overlap with scrollContainer's screen rect.
        // This works for any layout — scroll, translateX, translateY, transform.
        const bounds = this.measureTextNode(rect.node);
        outside =
          bounds.right < containerScreenLeft ||
          bounds.left > containerScreenRight ||
          bounds.bottom < containerScreenTop ||
          bounds.top > containerScreenBottom;
      }

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
    this.reconnectIframeObservers();
  }

  private isBeingHacked(element: HTMLElement): boolean {
    const style = element.getAttribute("style");
    const hasRealStyle = !!style && style.trim().length > 0;
    return !!(
      element.style.animation ||
      element.style.transition ||
      element.style.position ||
      hasRealStyle
    );
  }

  /** Listen for scroll events inside content iframes */
  private listenIframeScroll(): void {
    if (!this.config.contentIframes) return;
    for (const iframe of this.config.contentIframes) {
      try {
        const win = iframe.contentWindow;
        if (!win) continue;
        const handler = () => this.scheduleUpdate();
        // Listen on both contentWindow and contentDocument for broad compatibility
        win.addEventListener("scroll", handler, { passive: true });
        this.iframeScrollListeners.push({ target: win, handler });
      } catch {
        // cross-origin
      }
    }
  }

  /**
   * Build ObfuscationRect entries for text nodes in the given root.
   * For main document nodes, positions are stored document-relative.
   * For iframe nodes, positions are not pre-computed — they are measured live
   * in updateAllRects() since the iframe has its own scroll context.
   */
  private buildRects(parent: HTMLElement, iframe: HTMLIFrameElement | null): ObfuscationRect[] {
    const textNodes = this.findTextNodes(parent);
    const containerRect = this.config.scrollContainer.getBoundingClientRect();
    const scrollTop = this.config.scrollContainer.scrollTop;

    return textNodes.map((node) => {
      const parentTag = (node.parentElement?.nodeName ?? "").toLowerCase();
      const shouldExclude = this.excludeSet.has(parentTag);
      const text = node.textContent ?? "";
      const scrambled = shouldExclude ? text : this.scramble(text);

      let offsetTop = 0;
      let height = 0;

      if (!iframe) {
        // Main document: measure and store position
        const bounds = this.measureTextNode(node);
        offsetTop = bounds.top - containerRect.top + scrollTop;
        height = bounds.height;
      }
      // Iframe nodes: offsetTop/height not used — measured live in updateAllRects()

      return {
        node,
        textContent: text,
        scrambledTextContent: scrambled,
        isObfuscated: false,
        offsetTop,
        height,
        iframe,
      };
    });
  }

  /** Build rects for all content iframes */
  private buildIframeRects(): void {
    if (!this.config.contentIframes) return;
    for (const iframe of this.config.contentIframes) {
      try {
        const body = iframe.contentDocument?.body;
        if (body) {
          const iframeRects = this.buildRects(body, iframe);
          this.rects.push(...iframeRects);
        }
      } catch {
        // cross-origin iframe
      }
    }
  }

  /** Re-measure positions for main document nodes (on resize/layout change) */
  private remeasurePositions(): void {
    const containerRect = this.config.scrollContainer.getBoundingClientRect();
    const scrollTop = this.config.scrollContainer.scrollTop;

    for (const rect of this.rects) {
      if (rect.iframe) continue; // iframe nodes are measured live
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
      const ownerDoc = node.ownerDocument ?? document;
      const range = ownerDoc.createRange();
      range.selectNode(node);
      return range.getBoundingClientRect();
    } catch {
      return new DOMRect(0, 0, 0, 0);
    }
  }

  /** Scramble text by shuffling characters within each word */
  private scramble(text: string): string {
    return text
      .split(" ")
      .map((word) => {
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
        if (
          mutation.target === this.securityContainer ||
          mutation.target.parentElement === this.securityContainer
        ) {
          this.isHacked = true;
          this.config.onEvent?.({
            type: "tamper_detected",
            timestamp: Date.now(),
            detail: "sentinel",
          });
          this.updateAllRects();
          return;
        }

        if (mutation.type === "characterData") {
          const rect = this.rects.find((r) => r.node === mutation.target);
          if (rect && rect.isObfuscated) {
            rect.node.textContent = rect.scrambledTextContent;
          }
        }
      }
    });

    this.reconnectMutationObserver();
    this.startIframeObservers();
  }

  private startIframeObservers(): void {
    if (!this.config.contentIframes) return;
    const observerOpts: MutationObserverInit = {
      childList: true,
      subtree: true,
      characterData: true,
    };
    for (const iframe of this.config.contentIframes) {
      try {
        const body = iframe.contentDocument?.body;
        if (!body) continue;
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.type === "characterData") {
              const rect = this.rects.find((r) => r.node === mutation.target);
              if (rect && rect.isObfuscated) {
                rect.node.textContent = rect.scrambledTextContent;
              }
            }
          }
        });
        observer.observe(body, observerOpts);
        this.iframeObservers.push(observer);
      } catch {
        // cross-origin iframe
      }
    }
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

  private reconnectIframeObservers(): void {
    if (!this.config.contentIframes) return;
    const observerOpts: MutationObserverInit = {
      childList: true,
      subtree: true,
      characterData: true,
    };
    for (let i = 0; i < this.iframeObservers.length; i++) {
      try {
        const iframe = this.config.contentIframes[i];
        const body = iframe?.contentDocument?.body;
        if (body) {
          this.iframeObservers[i].observe(body, observerOpts);
        }
      } catch {
        // cross-origin
      }
    }
  }
}
