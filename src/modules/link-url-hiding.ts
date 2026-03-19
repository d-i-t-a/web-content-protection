/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule } from "../types";

export interface LinkUrlHidingConfig {
  /** Iframes containing book content with links to hide */
  contentIframes: HTMLIFrameElement[];
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
    for (const iframe of this.config.contentIframes) {
      try {
        const doc = iframe.contentDocument;
        if (!doc) continue;

        const anchors = doc.querySelectorAll("a");
        anchors.forEach((a) => {
          const href = a.getAttribute("href");
          if (!href) return;

          // Store original values
          if (!a.getAttribute("data-href")) {
            a.setAttribute("data-href", href);
            a.setAttribute("data-href-resolved", a.href);
          }

          // Clear visible href
          a.setAttribute("href", "");

          // Navigate on click using stored value
          const handler = (ev: Event) => {
            ev.preventDefault();
            const resolvedHref = (ev.currentTarget as HTMLAnchorElement).getAttribute("data-href-resolved");
            if (resolvedHref) {
              const nav = document.createElement("a");
              nav.setAttribute("href", resolvedHref);
              nav.click();
            }
          };
          a.addEventListener("click", handler);
          this.clickHandlers.push({ element: a, handler });
        });
      } catch {
        // cross-origin iframe
      }
    }
  }

  deactivate(): void {
    // Restore original hrefs
    for (const { element, handler } of this.clickHandlers) {
      element.removeEventListener("click", handler);
      const originalHref = element.getAttribute("data-href");
      if (originalHref) {
        element.setAttribute("href", originalHref);
      }
    }
    this.clickHandlers = [];
  }
}
