/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

export interface ListenerRecord {
  target: EventTarget;
  type: string;
  handler: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions;
}

export function isMac(): boolean {
  // navigator.platform is deprecated but still the most reliable check
  return (
    typeof navigator !== "undefined" &&
    (/Mac/.test(navigator.platform) ||
      // iPad in desktop mode
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1))
  );
}

export function addListenerSafe(
  target: EventTarget | null | undefined,
  type: string,
  handler: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
): ListenerRecord | null {
  if (!target) return null;
  try {
    target.addEventListener(type, handler, options);
    return { target, type, handler, options };
  } catch {
    return null;
  }
}

export function removeAllListeners(records: ListenerRecord[]): void {
  for (const { target, type, handler, options } of records) {
    try {
      target.removeEventListener(type, handler, options);
    } catch {
      // target may have been destroyed
    }
  }
  records.length = 0;
}

/**
 * Collects all relevant event targets for comprehensive protection:
 * main element, additional elements, iframes (multiple contexts each), window, document
 */
export function collectTargets(
  contentElement: HTMLElement,
  additionalElements?: HTMLElement[],
  contentIframes?: HTMLIFrameElement[],
): EventTarget[] {
  const targets: EventTarget[] = [contentElement, window, document];

  if (additionalElements) {
    targets.push(...additionalElements);
  }

  if (contentIframes) {
    for (const iframe of contentIframes) {
      try {
        targets.push(iframe);
        if (iframe.ownerDocument) targets.push(iframe.ownerDocument);
        if (iframe.contentDocument) {
          targets.push(iframe.contentDocument);
          if (iframe.contentDocument.body) targets.push(iframe.contentDocument.body);
        }
        if (iframe.contentWindow) {
          targets.push(iframe.contentWindow);
          if (iframe.contentWindow.document) targets.push(iframe.contentWindow.document);
        }
      } catch {
        // cross-origin iframe
      }
    }
  }

  return targets;
}
