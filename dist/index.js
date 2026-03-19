// src/utils.ts
function isMac() {
  return typeof navigator !== "undefined" && (/Mac/.test(navigator.platform) || // iPad in desktop mode
  navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function addListenerSafe(target, type, handler, options) {
  if (!target) return null;
  try {
    target.addEventListener(type, handler, options);
    return { target, type, handler, options };
  } catch {
    return null;
  }
}
function removeAllListeners(records) {
  for (const { target, type, handler, options } of records) {
    try {
      target.removeEventListener(type, handler, options);
    } catch {
    }
  }
  records.length = 0;
}
function collectTargets(contentElement, additionalElements, contentIframes) {
  const targets = [contentElement, window, document];
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
      }
    }
  }
  return targets;
}

// src/modules/drag-prevention.ts
var DragPrevention = class {
  constructor(config) {
    this.listeners = [];
    this.styledElements = [];
    this.config = config;
  }
  activate() {
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.config.onEvent?.({
        type: "drag_blocked",
        timestamp: Date.now()
      });
      return false;
    };
    const targets = collectTargets(
      this.config.contentElement,
      this.config.additionalElements,
      this.config.contentIframes
    );
    for (const target of targets) {
      for (const type of ["dragstart", "drag", "drop"]) {
        const rec = addListenerSafe(target, type, handler, true);
        if (rec) this.listeners.push(rec);
      }
    }
    this.applyCss(this.config.contentElement);
    if (this.config.contentIframes) {
      for (const iframe of this.config.contentIframes) {
        try {
          const body = iframe.contentDocument?.body;
          if (body) this.applyCss(body);
        } catch {
        }
      }
    }
  }
  deactivate() {
    removeAllListeners(this.listeners);
    for (const el of this.styledElements) {
      el.style.removeProperty("-webkit-user-drag");
      el.style.removeProperty("user-drag");
    }
    this.styledElements = [];
  }
  applyCss(el) {
    el.style.setProperty("-webkit-user-drag", "none");
    el.style.setProperty("user-drag", "none");
    this.styledElements.push(el);
    el.querySelectorAll("img").forEach((img) => {
      img.setAttribute("draggable", "false");
    });
  }
};

// src/modules/print-protection.ts
var PrintProtection = class {
  constructor(config) {
    this.listeners = [];
    this.styleElements = [];
    this.config = config;
  }
  activate() {
    this.styleElements.push(this.injectPrintCss(document));
    if (this.config.contentIframes) {
      for (const iframe of this.config.contentIframes) {
        try {
          const doc = iframe.contentDocument;
          if (doc) this.styleElements.push(this.injectPrintCss(doc));
        } catch {
        }
      }
    }
    const beforeHandler = (e) => {
      this.onBeforePrint();
      e.preventDefault?.();
      e.stopPropagation?.();
      this.config.onEvent?.({ type: "print_blocked", timestamp: Date.now() });
      return false;
    };
    const afterHandler = () => this.onAfterPrint();
    const windows = [window];
    if (this.config.contentIframes) {
      for (const iframe of this.config.contentIframes) {
        try {
          if (iframe.contentWindow) windows.push(iframe.contentWindow);
        } catch {
        }
      }
    }
    for (const win of windows) {
      const r1 = addListenerSafe(win, "beforeprint", beforeHandler);
      const r2 = addListenerSafe(win, "afterprint", afterHandler);
      if (r1) this.listeners.push(r1);
      if (r2) this.listeners.push(r2);
    }
    const keyHandler = (e) => {
      const ke = e;
      const modifier = isMac() ? ke.metaKey : ke.ctrlKey;
      if (modifier && ke.key === "p") {
        ke.preventDefault();
        ke.stopPropagation();
        this.config.onEvent?.({ type: "print_blocked", timestamp: Date.now(), detail: "keyboard" });
      }
    };
    const r = addListenerSafe(document, "keydown", keyHandler, true);
    if (r) this.listeners.push(r);
    if (this.config.contentIframes) {
      for (const iframe of this.config.contentIframes) {
        try {
          const doc = iframe.contentDocument;
          if (doc) {
            const r2 = addListenerSafe(doc, "keydown", keyHandler, true);
            if (r2) this.listeners.push(r2);
          }
        } catch {
        }
      }
    }
  }
  deactivate() {
    removeAllListeners(this.listeners);
    for (const style of this.styleElements) {
      style.remove();
    }
    this.styleElements = [];
  }
  injectPrintCss(doc) {
    const style = doc.createElement("style");
    style.setAttribute("data-protection", "print");
    style.textContent = `
      @media print {
        body, body * {
          visibility: hidden !important;
          display: none !important;
        }
      }
    `;
    doc.head.appendChild(style);
    return style;
  }
  onBeforePrint() {
    const elements = [
      this.config.contentElement,
      ...this.config.additionalElements ?? []
    ];
    for (const el of elements) {
      el.style.setProperty("display", "none", "important");
      el.style.setProperty("visibility", "hidden", "important");
    }
  }
  onAfterPrint() {
    const elements = [
      this.config.contentElement,
      ...this.config.additionalElements ?? []
    ];
    for (const el of elements) {
      el.style.removeProperty("display");
      el.style.removeProperty("visibility");
    }
  }
};

// src/modules/copy-protection.ts
var CopyProtection = class {
  constructor(config) {
    this.listeners = [];
    this._citationActive = false;
    this.config = {
      blockedMessage: "",
      blockCut: true,
      citationBypass: false,
      ...config
    };
  }
  /** Temporarily allow copying for citation workflows */
  set citationMode(active) {
    this._citationActive = active;
  }
  get citationMode() {
    return this._citationActive;
  }
  activate() {
    const targets = collectTargets(
      this.config.contentElement,
      this.config.additionalElements,
      this.config.contentIframes
    );
    const copyHandler = (e) => this.onCopy(e);
    const keyHandler = (e) => this.onCopyKey(e);
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
  deactivate() {
    removeAllListeners(this.listeners);
  }
  onCopy(event) {
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
        detail: `${selection.length} chars \u2192 ${trimmed.length} chars`
      });
      return false;
    }
  }
  onCopyKey(event) {
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
    }
    if (this.config.mode === "block" && event.key === "a") {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
  }
  getSelectionText(target) {
    try {
      if (target instanceof HTMLElement) {
        const doc = target.ownerDocument;
        return doc?.getSelection()?.toString() ?? "";
      }
    } catch {
    }
    return window.getSelection()?.toString() ?? "";
  }
  fallbackCopy(text) {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
};

// src/modules/context-menu-protection.ts
var ContextMenuProtection = class {
  constructor(config) {
    this.listeners = [];
    this.config = config;
  }
  activate() {
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.config.onEvent?.({ type: "context_menu_blocked", timestamp: Date.now() });
      return false;
    };
    const targets = collectTargets(
      this.config.contentElement,
      this.config.additionalElements,
      this.config.contentIframes
    );
    for (const target of targets) {
      const rec = addListenerSafe(target, "contextmenu", handler, true);
      if (rec) this.listeners.push(rec);
    }
  }
  deactivate() {
    removeAllListeners(this.listeners);
  }
};

// src/modules/keyboard-protection.ts
var KeyboardProtection = class {
  constructor(config) {
    this.listeners = [];
    this.config = {
      blockSave: true,
      blockViewSource: true,
      blockDevToolsShortcut: true,
      blockConsoleShortcut: true,
      blockF12: true,
      ...config
    };
  }
  activate() {
    const handler = (e) => this.onKeyDown(e);
    const targets = collectTargets(
      this.config.contentElement,
      this.config.additionalElements,
      this.config.contentIframes
    );
    for (const target of targets) {
      const rec = addListenerSafe(target, "keydown", handler, true);
      if (rec) this.listeners.push(rec);
    }
  }
  deactivate() {
    removeAllListeners(this.listeners);
  }
  onKeyDown(e) {
    const mac = isMac();
    const ctrl = mac ? e.metaKey : e.ctrlKey;
    if (this.config.blockSave && ctrl && e.key === "s") {
      return this.block(e, "save");
    }
    if (this.config.blockViewSource && ctrl && e.key === "u") {
      return this.block(e, "view-source");
    }
    if (this.config.blockDevToolsShortcut && ctrl && e.shiftKey && e.key === "I") {
      return this.block(e, "devtools");
    }
    if (this.config.blockDevToolsShortcut && mac && e.altKey && e.metaKey && e.key === "i") {
      return this.block(e, "devtools");
    }
    if (this.config.blockConsoleShortcut && ctrl && e.shiftKey && e.key === "J") {
      return this.block(e, "console");
    }
    if (this.config.blockConsoleShortcut && mac && e.altKey && e.metaKey && e.key === "j") {
      return this.block(e, "console");
    }
    if (this.config.blockF12 && e.key === "F12") {
      return this.block(e, "F12");
    }
    if (this.config.customBlockedKeys) {
      for (const combo of this.config.customBlockedKeys) {
        const ctrlMatch = combo.ctrl ? mac ? e.metaKey : e.ctrlKey : true;
        const metaMatch = combo.meta ? e.metaKey : true;
        const shiftMatch = combo.shift ? e.shiftKey : true;
        const altMatch = combo.alt ? e.altKey : true;
        if (e.key === combo.key && ctrlMatch && metaMatch && shiftMatch && altMatch) {
          return this.block(e, `custom:${combo.key}`);
        }
      }
    }
  }
  block(e, detail) {
    e.preventDefault();
    e.stopPropagation();
    this.config.onEvent?.({ type: "key_blocked", timestamp: Date.now(), detail });
    return false;
  }
};

// src/modules/devtools-detection.ts
var DevToolsDetection = class {
  constructor(config) {
    this.timer = null;
    this.detected = false;
    this.usingLibrary = false;
    this.config = {
      clearLocalStorage: true,
      clearSessionStorage: true,
      clearConsole: true,
      interval: 1e3,
      initDelay: 100,
      redirectUrl: typeof window !== "undefined" ? window.location.origin : "/",
      ...config
    };
  }
  async activate() {
    try {
      const dtd = await import("devtools-detector");
      dtd.addListener((isOpen) => {
        if (isOpen && !this.detected) {
          this.onDetected();
        }
      });
      dtd.launch();
      this.usingLibrary = true;
    } catch {
      this.startHeuristicDetection();
    }
    await new Promise((r) => setTimeout(r, this.config.initDelay));
  }
  deactivate() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.detected = false;
  }
  startHeuristicDetection() {
    this.timer = setInterval(() => {
      if (this.isDevToolsOpen()) {
        this.onDetected();
      }
    }, this.config.interval);
  }
  isDevToolsOpen() {
    const widthDelta = window.outerWidth - window.innerWidth > 160;
    const heightDelta = window.outerHeight - window.innerHeight > 160;
    if (widthDelta || heightDelta) return true;
    try {
      const start = performance.now();
      for (let i = 0; i < 100; i++) console.debug();
      if (performance.now() - start > 10) return true;
    } catch {
    }
    return false;
  }
  onDetected() {
    this.detected = true;
    if (this.config.clearConsole) {
      try {
        console.clear();
      } catch {
      }
    }
    if (this.config.clearLocalStorage) {
      try {
        window.localStorage.clear();
      } catch {
      }
    }
    if (this.config.clearSessionStorage) {
      try {
        window.sessionStorage.clear();
      } catch {
      }
    }
    if (this.config.action === "callback" || this.config.action === "both") {
      this.config.onEvent?.({ type: "devtools_detected", timestamp: Date.now() });
    }
    if (this.config.action === "redirect" || this.config.action === "both") {
      window.location.replace(this.config.redirectUrl ?? window.location.origin);
    }
  }
};

// src/modules/text-obfuscation.ts
var TextObfuscation = class {
  constructor(config) {
    this.rects = [];
    this.mutationObserver = null;
    this.isHacked = false;
    this.securityContainer = null;
    this.rafId = null;
    this.config = {
      excludeNodes: ["script", "style", "option", "noscript", "textarea", "code", "pre"],
      viewportPadding: 50,
      ...config
    };
    this.excludeSet = new Set(this.config.excludeNodes.map((n) => n.toLowerCase()));
    this.scrollHandler = () => this.scheduleUpdate();
    this.resizeHandler = () => this.scheduleUpdate();
  }
  activate() {
    this.securityContainer = document.createElement("div");
    this.securityContainer.setAttribute("data-protection", "sentinel");
    this.securityContainer.style.cssText = "";
    this.config.contentRoot.appendChild(this.securityContainer);
    this.rects = this.findRects(this.config.contentRoot);
    this.updateAllRects();
    this.config.scrollContainer.addEventListener("scroll", this.scrollHandler, { passive: true });
    window.addEventListener("resize", this.resizeHandler, { passive: true });
    this.startMutationObserver();
  }
  deactivate() {
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
  reinitialize() {
    for (const rect of this.rects) {
      if (rect.isObfuscated) {
        rect.node.textContent = rect.textContent;
      }
    }
    this.rects = this.findRects(this.config.contentRoot);
    this.updateAllRects();
  }
  /** Recalculate positions after layout changes (font size, window resize) */
  recalculate() {
    for (const rect of this.rects) {
      const bounds = this.measureTextNode(rect.node);
      rect.top = bounds.top;
      rect.left = bounds.left;
      rect.width = bounds.width;
      rect.height = bounds.height;
    }
    this.updateAllRects();
  }
  scheduleUpdate() {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.updateAllRects();
    });
  }
  updateAllRects() {
    const hacked = this.securityContainer ? this.isBeingHacked(this.securityContainer) : false;
    if (hacked && !this.isHacked) {
      this.isHacked = true;
      this.config.onEvent?.({ type: "tamper_detected", timestamp: Date.now() });
    }
    for (const rect of this.rects) {
      this.toggleRect(rect, hacked);
    }
  }
  toggleRect(rect, hacked) {
    const outside = this.isOutsideViewport(rect);
    if (rect.isObfuscated && !outside && !hacked && !this.isHacked) {
      rect.node.textContent = rect.textContent;
      rect.isObfuscated = false;
    }
    if (!rect.isObfuscated && (outside || hacked || this.isHacked)) {
      rect.node.textContent = rect.scrambledTextContent;
      rect.isObfuscated = true;
    }
  }
  isOutsideViewport(rect) {
    const c = this.config.scrollContainer;
    const pad = this.config.viewportPadding ?? 50;
    const lineHeight = this.getLineHeight(rect.node);
    const windowLeft = c.scrollLeft;
    const windowRight = windowLeft + c.clientWidth;
    const windowTop = c.scrollTop - lineHeight;
    const windowBottom = windowTop + c.clientHeight + lineHeight + pad;
    const right = rect.left + rect.width;
    const bottom = rect.top + rect.height;
    const isAbove = bottom < windowTop;
    const isBelow = rect.top > windowBottom;
    const isLeft = right < windowLeft - window.innerWidth;
    const isRight = rect.left > windowRight + window.innerWidth;
    return isAbove || isBelow || isLeft || isRight;
  }
  isBeingHacked(element) {
    return !!(element.style.animation || element.style.transition || element.style.position || element.hasAttribute("style"));
  }
  findRects(parent) {
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
        height: bounds.height
      };
    });
  }
  findTextNodes(parent, nodes = []) {
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
  measureTextNode(node) {
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
  getLineHeight(node) {
    try {
      if (node.parentElement) {
        return parseInt(getComputedStyle(node.parentElement).lineHeight.replace("px", "")) || 10;
      }
    } catch {
    }
    return 10;
  }
  /** Scramble text by shuffling characters within each word */
  scramble(text) {
    return text.split(" ").map((word) => {
      if (word.includes("-") || word.length <= 2) return word;
      const chars = word.split("");
      for (let i = chars.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [chars[i], chars[j]] = [chars[j], chars[i]];
      }
      return chars.join("");
    }).join(" ");
  }
  startMutationObserver() {
    this.mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.target === this.securityContainer || mutation.target.parentElement === this.securityContainer) {
          this.isHacked = true;
          this.config.onEvent?.({ type: "tamper_detected", timestamp: Date.now(), detail: "sentinel" });
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
    this.mutationObserver.observe(this.config.contentRoot, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style"]
    });
  }
};

// src/modules/link-url-hiding.ts
var LinkUrlHiding = class {
  constructor(config) {
    this.clickHandlers = [];
    this.config = config;
  }
  activate() {
    for (const iframe of this.config.contentIframes) {
      try {
        const doc = iframe.contentDocument;
        if (!doc) continue;
        const anchors = doc.querySelectorAll("a");
        anchors.forEach((a) => {
          const href = a.getAttribute("href");
          if (!href) return;
          if (!a.getAttribute("data-href")) {
            a.setAttribute("data-href", href);
            a.setAttribute("data-href-resolved", a.href);
          }
          a.setAttribute("href", "");
          const handler = (ev) => {
            ev.preventDefault();
            const resolvedHref = ev.currentTarget.getAttribute("data-href-resolved");
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
      }
    }
  }
  deactivate() {
    for (const { element, handler } of this.clickHandlers) {
      element.removeEventListener("click", handler);
      const originalHref = element.getAttribute("data-href");
      if (originalHref) {
        element.setAttribute("href", originalHref);
      }
    }
    this.clickHandlers = [];
  }
};

// src/modules/browser-enforcement.ts
var BrowserEnforcement = class {
  constructor(config) {
    this.config = config;
  }
  async activate() {
    const supported = await this.isSupported();
    if (!supported) {
      this.config.onEvent?.({
        type: "browser_unsupported",
        timestamp: Date.now(),
        detail: navigator.userAgent
      });
      if (this.config.action === "throw" || this.config.action === "both") {
        throw new Error(
          `Browser not supported. Supported browsers: ${this.config.supportedBrowsers.join(", ")}`
        );
      }
    }
  }
  deactivate() {
  }
  async isSupported() {
    try {
      const { getUserAgentRegex } = await import("browserslist-useragent-regexp");
      const queries = this.config.supportedBrowsers.map((b) => `last 1 ${b} version`);
      const regex = getUserAgentRegex({
        browsers: queries,
        allowHigherVersions: true
      });
      return regex.test(navigator.userAgent);
    } catch {
      return this.basicCheck();
    }
  }
  basicCheck() {
    const ua = navigator.userAgent.toLowerCase();
    const browserMap = {
      chrome: /chrome|chromium|crios/,
      firefox: /firefox|fxios/,
      safari: /safari(?!.*chrome)/,
      edge: /edg/,
      opera: /opr|opera/,
      samsung: /samsungbrowser/
    };
    return this.config.supportedBrowsers.some((browser) => {
      const regex = browserMap[browser.toLowerCase()];
      return regex ? regex.test(ua) : false;
    });
  }
};

// src/modules/screenshot-detection.ts
var ScreenshotDetection = class {
  constructor(config) {
    this.listeners = [];
    this.restoreTimer = null;
    this.savedDisplays = /* @__PURE__ */ new Map();
    this.config = {
      blankOnBlur: true,
      blankOnHidden: true,
      detectPrintScreen: true,
      restoreDelay: 500,
      ...config
    };
  }
  activate() {
    if (this.config.blankOnHidden) {
      const visHandler = () => {
        if (document.visibilityState === "hidden") {
          this.blankContent("visibility_change");
        } else {
          this.scheduleRestore();
        }
      };
      const rec = addListenerSafe(document, "visibilitychange", visHandler);
      if (rec) this.listeners.push(rec);
    }
    if (this.config.blankOnBlur) {
      const blurHandler = () => this.blankContent("visibility_change");
      const focusHandler = () => this.scheduleRestore();
      const r1 = addListenerSafe(window, "blur", blurHandler);
      const r2 = addListenerSafe(window, "focus", focusHandler);
      if (r1) this.listeners.push(r1);
      if (r2) this.listeners.push(r2);
    }
    if (this.config.detectPrintScreen) {
      const keyHandler = (e) => {
        const ke = e;
        if (ke.key === "PrintScreen") {
          this.blankContent("screenshot_suspected");
          this.scheduleRestore();
        }
      };
      const rec = addListenerSafe(document, "keyup", keyHandler, true);
      if (rec) this.listeners.push(rec);
    }
  }
  deactivate() {
    removeAllListeners(this.listeners);
    this.restoreContent();
    if (this.restoreTimer) {
      clearTimeout(this.restoreTimer);
      this.restoreTimer = null;
    }
  }
  blankContent(reason) {
    for (const el of this.config.protectedElements) {
      if (!this.savedDisplays.has(el)) {
        this.savedDisplays.set(el, el.style.display);
      }
      el.style.setProperty("visibility", "hidden", "important");
    }
    this.config.onEvent?.({ type: reason, timestamp: Date.now() });
  }
  restoreContent() {
    for (const el of this.config.protectedElements) {
      el.style.removeProperty("visibility");
    }
    this.savedDisplays.clear();
  }
  scheduleRestore() {
    if (this.restoreTimer) clearTimeout(this.restoreTimer);
    this.restoreTimer = setTimeout(() => {
      this.restoreContent();
      this.restoreTimer = null;
    }, this.config.restoreDelay);
  }
};

// src/modules/watermarking.ts
var Watermarking = class {
  constructor(config) {
    this.overlayElement = null;
    this.originalTexts = /* @__PURE__ */ new Map();
    this.config = {
      opacity: 0.02,
      color: "#000000",
      fontSize: 14,
      rotation: -30,
      enableTextFingerprint: false,
      ...config
    };
  }
  activate() {
    this.applyVisualWatermark();
    if (this.config.enableTextFingerprint) {
      this.applyTextFingerprint();
    }
  }
  deactivate() {
    this.overlayElement?.remove();
    this.overlayElement = null;
    for (const [node, text] of this.originalTexts) {
      node.textContent = text;
    }
    this.originalTexts.clear();
  }
  /** Call when content changes (page turn, chapter navigation) */
  reinitialize() {
    this.originalTexts.clear();
    if (this.config.enableTextFingerprint) {
      this.applyTextFingerprint();
    }
  }
  applyVisualWatermark() {
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
  applyTextFingerprint() {
    const fingerprint = this.encodeFingerprint(this.config.userId);
    const textNodes = this.findTextNodes(this.config.contentRoot);
    for (const node of textNodes) {
      const original = node.textContent ?? "";
      if (!original.trim()) continue;
      this.originalTexts.set(node, original);
      const words = original.split(" ");
      if (words.length < 2) continue;
      words[0] = words[0] + fingerprint;
      node.textContent = words.join(" ");
    }
  }
  /**
   * Encode a user ID as a sequence of zero-width characters.
   * Uses zero-width space (U+200B) for 0 and zero-width non-joiner (U+200C) for 1.
   */
  encodeFingerprint(userId) {
    const ZERO = "\u200B";
    const ONE = "\u200C";
    const SEP = "\u200D";
    let binary = "";
    for (let i = 0; i < userId.length; i++) {
      binary += userId.charCodeAt(i).toString(2).padStart(8, "0");
    }
    return SEP + binary.split("").map((b) => b === "0" ? ZERO : ONE).join("") + SEP;
  }
  /**
   * Decode a fingerprint back to a user ID.
   * Useful for analyzing leaked content.
   */
  static decodeFingerprint(text) {
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
    let result = "";
    for (let i = 0; i < binary.length; i += 8) {
      const byte = binary.substring(i, i + 8);
      if (byte.length === 8) {
        result += String.fromCharCode(parseInt(byte, 2));
      }
    }
    return result || null;
  }
  buildWatermarkText() {
    const parts = [this.config.userId];
    if (this.config.sessionId) parts.push(this.config.sessionId);
    parts.push((/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
    return parts.join(" | ");
  }
  findTextNodes(parent, nodes = []) {
    let child = parent.firstChild;
    while (child) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.nodeName.toLowerCase();
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
};

// src/modules/selection-limiting.ts
var SelectionLimiting = class {
  constructor(config) {
    this.listeners = [];
    this.checking = false;
    this.config = config;
  }
  activate() {
    const handler = () => this.checkSelection();
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
        }
      }
    }
  }
  deactivate() {
    removeAllListeners(this.listeners);
  }
  checkSelection() {
    if (this.checking) return;
    this.checking = true;
    try {
      this.enforceLimit(document);
      if (this.config.contentIframes) {
        for (const iframe of this.config.contentIframes) {
          try {
            const doc = iframe.contentDocument;
            if (doc) this.enforceLimit(doc);
          } catch {
          }
        }
      }
    } finally {
      this.checking = false;
    }
  }
  enforceLimit(doc) {
    const selection = doc.getSelection();
    if (!selection || selection.isCollapsed) return;
    const text = selection.toString();
    if (text.length <= this.config.maxSelectionLength) return;
    if (this.config.behavior === "collapse") {
      selection.collapseToStart();
    } else if (this.config.behavior === "truncate") {
      try {
        const range = selection.getRangeAt(0);
        this.truncateRange(range, doc, this.config.maxSelectionLength);
      } catch {
        selection.collapseToStart();
      }
    }
    this.config.onEvent?.({
      type: "copy_blocked",
      timestamp: Date.now(),
      detail: `selection exceeded ${this.config.maxSelectionLength} chars (was ${text.length})`
    });
  }
  truncateRange(range, doc, maxChars) {
    const walker = doc.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT
    );
    let charCount = 0;
    let node = walker.nextNode();
    while (node) {
      const text = node.textContent ?? "";
      if (charCount + text.length > maxChars) {
        const remaining = maxChars - charCount;
        range.setEnd(node, remaining);
        return;
      }
      charCount += text.length;
      node = walker.nextNode();
    }
  }
};

// src/content-protection.ts
var ContentProtection = class {
  constructor(config) {
    this.modules = /* @__PURE__ */ new Map();
    this.eventLog = [];
    this.config = config;
    this.initModules();
  }
  initModules() {
    const onEvent = (event) => {
      this.eventLog.push(event);
      this.config.onEvent?.(event);
    };
    if (this.config.dragPrevention) {
      this.modules.set("drag", new DragPrevention({ ...this.config.dragPrevention, onEvent }));
    }
    if (this.config.printProtection) {
      this.modules.set("print", new PrintProtection({ ...this.config.printProtection, onEvent }));
    }
    if (this.config.copyProtection) {
      this.modules.set("copy", new CopyProtection({ ...this.config.copyProtection, onEvent }));
    }
    if (this.config.contextMenuProtection) {
      this.modules.set("contextMenu", new ContextMenuProtection({ ...this.config.contextMenuProtection, onEvent }));
    }
    if (this.config.keyboardProtection) {
      this.modules.set("keyboard", new KeyboardProtection({ ...this.config.keyboardProtection, onEvent }));
    }
    if (this.config.devToolsDetection) {
      this.modules.set("devtools", new DevToolsDetection({ ...this.config.devToolsDetection, onEvent }));
    }
    if (this.config.textObfuscation) {
      this.modules.set("obfuscation", new TextObfuscation({ ...this.config.textObfuscation, onEvent }));
    }
    if (this.config.linkUrlHiding) {
      this.modules.set("linkHiding", new LinkUrlHiding(this.config.linkUrlHiding));
    }
    if (this.config.browserEnforcement) {
      this.modules.set("browser", new BrowserEnforcement({ ...this.config.browserEnforcement, onEvent }));
    }
    if (this.config.screenshotDetection) {
      this.modules.set("screenshot", new ScreenshotDetection({ ...this.config.screenshotDetection, onEvent }));
    }
    if (this.config.watermarking) {
      this.modules.set("watermark", new Watermarking(this.config.watermarking));
    }
    if (this.config.selectionLimiting) {
      this.modules.set("selection", new SelectionLimiting({ ...this.config.selectionLimiting, onEvent }));
    }
  }
  /** Activate all configured modules. Browser enforcement runs first (may throw). */
  async activate() {
    const browser = this.modules.get("browser");
    if (browser) await browser.activate();
    const devtools = this.modules.get("devtools");
    if (devtools) await devtools.activate();
    for (const [name, module] of this.modules) {
      if (name === "browser" || name === "devtools") continue;
      await module.activate();
    }
  }
  /** Deactivate all modules and restore original state */
  deactivate() {
    for (const module of this.modules.values()) {
      module.deactivate();
    }
  }
  /** Get a specific module instance for advanced control */
  getModule(name) {
    return this.modules.get(name);
  }
  /** Get the copy protection module (for citation bypass control) */
  get copyProtection() {
    return this.modules.get("copy");
  }
  /** Get the text obfuscation module (for reinitialize on page turn) */
  get textObfuscation() {
    return this.modules.get("obfuscation");
  }
  /** Get the watermarking module (for reinitialize on page turn) */
  get watermarking() {
    return this.modules.get("watermark");
  }
  /** Get all logged protection events */
  getEventLog() {
    return this.eventLog;
  }
  /** Clear the event log */
  clearEventLog() {
    this.eventLog = [];
  }
};
export {
  BrowserEnforcement,
  ContentProtection,
  ContextMenuProtection,
  CopyProtection,
  DevToolsDetection,
  DragPrevention,
  KeyboardProtection,
  LinkUrlHiding,
  PrintProtection,
  ScreenshotDetection,
  SelectionLimiting,
  TextObfuscation,
  Watermarking
};
//# sourceMappingURL=index.js.map