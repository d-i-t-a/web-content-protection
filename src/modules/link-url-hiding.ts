/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule } from "../types";

export interface LinkUrlHidingConfig {
  /** Root element containing links to hide (direct DOM) */
  contentRoot?: HTMLElement;
  /** Iframes containing book content with links to hide */
  contentIframes?: HTMLIFrameElement[];
}

/**
 * Hides link target URLs from the status bar.
 * Stores real href in data attributes and restores on click.
 * Prevents users from seeing/copying content URLs.
 */
export class LinkUrlHiding implements ProtectionModule {
  private config: LinkUrlHidingConfig;
  private clickHandlers: Array<{ element: HTMLAnchorElement; handler: EventListener }> = [];

  constructor(config: LinkUrlHidingConfig) {
    this.config = config;
  }

  activate(): void {
    // Process direct DOM content
    if (this.config.contentRoot) {
      this.hideLinksIn(this.config.contentRoot);
    }

    // Process iframes
    if (this.config.contentIframes) {
      for (const iframe of this.config.contentIframes) {
        try {
          const body = iframe.contentDocument?.body;
          if (body) this.hideLinksIn(body);
        } catch {
          // cross-origin iframe
        }
      }
    }
  }

  private hideLinksIn(root: HTMLElement): void {
    const anchors = root.querySelectorAll("a[href]");
    anchors.forEach((a) => {
      const anchor = a as HTMLAnchorElement;
      const href = anchor.getAttribute("href");
      if (!href || href === "" || href === "#") return;

      // Store original values
      if (!anchor.getAttribute("data-href")) {
        anchor.setAttribute("data-href", href);
        anchor.setAttribute("data-href-resolved", anchor.href);
      }

      // Clear visible href so status bar shows nothing
      anchor.removeAttribute("href");
      anchor.style.cursor = "pointer";
      // Keep the visual appearance of a link
      if (!anchor.style.color) {
        anchor.style.textDecoration = "underline";
      }

      // Navigate on click using stored value
      const handler = (ev: Event) => {
        ev.preventDefault();
        const resolvedHref = (ev.currentTarget as HTMLAnchorElement).getAttribute(
          "data-href-resolved",
        );
        if (resolvedHref) {
          window.open(resolvedHref, anchor.getAttribute("target") || "_blank");
        }
      };
      anchor.addEventListener("click", handler);
      this.clickHandlers.push({ element: anchor, handler });
    });
  }

  deactivate(): void {
    for (const { element, handler } of this.clickHandlers) {
      element.removeEventListener("click", handler);
      const originalHref = element.getAttribute("data-href");
      if (originalHref) {
        element.setAttribute("href", originalHref);
        element.style.cursor = "";
      }
      element.removeAttribute("data-href");
      element.removeAttribute("data-href-resolved");
    }
    this.clickHandlers = [];
  }
}
