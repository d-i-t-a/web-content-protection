/** Base interface for all protection modules */
interface ProtectionModule {
    activate(): void | Promise<void>;
    deactivate(): void;
}
/** Callback when a protection event occurs */
type ProtectionEventCallback = (event: ProtectionEvent) => void;
interface ProtectionEvent {
    type: "copy_blocked" | "copy_restricted" | "print_blocked" | "drag_blocked" | "context_menu_blocked" | "key_blocked" | "devtools_detected" | "tamper_detected" | "visibility_change" | "screenshot_suspected" | "browser_unsupported";
    timestamp: number;
    detail?: string;
}
/** Common config shared across modules */
interface CommonTargets {
    contentElement: HTMLElement;
    additionalElements?: HTMLElement[];
    contentIframes?: HTMLIFrameElement[];
}

interface DragPreventionConfig extends CommonTargets {
    onEvent?: ProtectionEventCallback;
}
declare class DragPrevention implements ProtectionModule {
    private config;
    private listeners;
    private styledElements;
    constructor(config: DragPreventionConfig);
    activate(): void;
    deactivate(): void;
    private applyCss;
}

interface PrintProtectionConfig extends CommonTargets {
    onEvent?: ProtectionEventCallback;
}
declare class PrintProtection implements ProtectionModule {
    private config;
    private listeners;
    private styleElements;
    constructor(config: PrintProtectionConfig);
    activate(): void;
    deactivate(): void;
    private injectPrintCss;
    private onBeforePrint;
    private onAfterPrint;
}

interface CopyProtectionConfig extends CommonTargets {
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
declare class CopyProtection implements ProtectionModule {
    private config;
    private listeners;
    private _citationActive;
    constructor(config: CopyProtectionConfig);
    /** Temporarily allow copying for citation workflows */
    set citationMode(active: boolean);
    get citationMode(): boolean;
    activate(): void;
    deactivate(): void;
    private onCopy;
    private onCopyKey;
    private getSelectionText;
    private fallbackCopy;
}

interface ContextMenuProtectionConfig extends CommonTargets {
    onEvent?: ProtectionEventCallback;
}
declare class ContextMenuProtection implements ProtectionModule {
    private config;
    private listeners;
    constructor(config: ContextMenuProtectionConfig);
    activate(): void;
    deactivate(): void;
}

interface KeyboardProtectionConfig extends CommonTargets {
    /** Block Ctrl+S / Cmd+S (save page) — default true */
    blockSave?: boolean;
    /** Block Ctrl+U / Cmd+U (view source) — default true */
    blockViewSource?: boolean;
    /** Block Ctrl+Shift+I / Cmd+Opt+I (dev tools) — default true */
    blockDevToolsShortcut?: boolean;
    /** Block Ctrl+Shift+J / Cmd+Opt+J (console) — default true */
    blockConsoleShortcut?: boolean;
    /** Block F12 (dev tools) — default true */
    blockF12?: boolean;
    /** Additional key combinations to block: e.g. [{ key: "s", ctrl: true }] */
    customBlockedKeys?: Array<{
        key: string;
        ctrl?: boolean;
        meta?: boolean;
        shift?: boolean;
        alt?: boolean;
    }>;
    onEvent?: ProtectionEventCallback;
}
declare class KeyboardProtection implements ProtectionModule {
    private config;
    private listeners;
    constructor(config: KeyboardProtectionConfig);
    activate(): void;
    deactivate(): void;
    private onKeyDown;
    private block;
}

interface DevToolsDetectionConfig {
    /** What to do when DevTools is detected */
    action: "redirect" | "callback" | "both";
    /** URL to redirect to (defaults to window.location.origin) */
    redirectUrl?: string;
    /** Clear localStorage on detection */
    clearLocalStorage?: boolean;
    /** Clear sessionStorage on detection */
    clearSessionStorage?: boolean;
    /** Clear console on detection */
    clearConsole?: boolean;
    /** Polling interval in ms for heuristic fallback (default: 1000) */
    interval?: number;
    /** Delay before starting detection in ms (default: 100) */
    initDelay?: number;
    onEvent?: ProtectionEventCallback;
}
declare class DevToolsDetection implements ProtectionModule {
    private config;
    private timer;
    private detected;
    private usingLibrary;
    constructor(config: DevToolsDetectionConfig);
    activate(): Promise<void>;
    deactivate(): void;
    private startHeuristicDetection;
    private isDevToolsOpen;
    private onDetected;
}

interface TextObfuscationConfig {
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
declare class TextObfuscation implements ProtectionModule {
    private config;
    private rects;
    private mutationObserver;
    private scrollHandler;
    private resizeHandler;
    private isHacked;
    private securityContainer;
    private rafId;
    private excludeSet;
    constructor(config: TextObfuscationConfig);
    activate(): void;
    deactivate(): void;
    /** Call when content changes (page turn, chapter navigation) */
    reinitialize(): void;
    /** Recalculate positions after layout changes (font size, window resize) */
    recalculate(): void;
    private scheduleUpdate;
    private updateAllRects;
    private toggleRect;
    private isOutsideViewport;
    private isBeingHacked;
    private findRects;
    private findTextNodes;
    private measureTextNode;
    private getLineHeight;
    /** Scramble text by shuffling characters within each word */
    private scramble;
    private startMutationObserver;
}

interface LinkUrlHidingConfig {
    /** Iframes containing book content with links to hide */
    contentIframes: HTMLIFrameElement[];
}
/**
 * Hides link target URLs from the status bar.
 * Stores real href in data attributes and restores on click.
 * Prevents users from seeing/copying content URLs.
 */
declare class LinkUrlHiding implements ProtectionModule {
    private config;
    private clickHandlers;
    constructor(config: LinkUrlHidingConfig);
    activate(): void;
    deactivate(): void;
}

interface BrowserEnforcementConfig {
    /** Browser names to allow, e.g. ["chrome", "firefox", "safari", "edge"] */
    supportedBrowsers: string[];
    /** What to do when browser is unsupported */
    action: "throw" | "callback" | "both";
    onEvent?: ProtectionEventCallback;
}
/**
 * Restricts the reader to a whitelist of supported browsers.
 * Uses browserslist-useragent-regexp (optional dependency) for accurate matching,
 * falls back to basic user-agent parsing.
 */
declare class BrowserEnforcement implements ProtectionModule {
    private config;
    constructor(config: BrowserEnforcementConfig);
    activate(): Promise<void>;
    deactivate(): void;
    private isSupported;
    private basicCheck;
}

interface ScreenshotDetectionConfig {
    /** Elements to blank when screenshot/recording is suspected */
    protectedElements: HTMLElement[];
    /** Blank content when tab loses focus (Alt+Tab to screenshot tool) */
    blankOnBlur?: boolean;
    /** Blank content when page visibility changes to hidden (screen recording apps) */
    blankOnHidden?: boolean;
    /** Blank content when window is resized to exact screenshot dimensions */
    detectPrintScreen?: boolean;
    /** How long to keep content blanked after visibility returns, in ms (default: 500) */
    restoreDelay?: number;
    onEvent?: ProtectionEventCallback;
}
/**
 * Detects potential screenshot/screen capture attempts and blanks content.
 *
 * Detection strategies:
 * - Page Visibility API: content hidden when tab not active
 * - Window blur: content hidden when window loses focus
 * - PrintScreen key detection (limited browser support)
 *
 * This is a deterrent, not a hard block — it makes casual screenshotting
 * return blank pages but cannot prevent hardware capture.
 */
declare class ScreenshotDetection implements ProtectionModule {
    private config;
    private listeners;
    private restoreTimer;
    private savedDisplays;
    constructor(config: ScreenshotDetectionConfig);
    activate(): void;
    deactivate(): void;
    private blankContent;
    private restoreContent;
    private scheduleRestore;
}

interface WatermarkingConfig {
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
declare class Watermarking implements ProtectionModule {
    private config;
    private overlayElement;
    private originalTexts;
    constructor(config: WatermarkingConfig);
    activate(): void;
    deactivate(): void;
    /** Call when content changes (page turn, chapter navigation) */
    reinitialize(): void;
    private applyVisualWatermark;
    private applyTextFingerprint;
    /**
     * Encode a user ID as a sequence of zero-width characters.
     * Uses zero-width space (U+200B) for 0 and zero-width non-joiner (U+200C) for 1.
     */
    private encodeFingerprint;
    /**
     * Decode a fingerprint back to a user ID.
     * Useful for analyzing leaked content.
     */
    static decodeFingerprint(text: string): string | null;
    private buildWatermarkText;
    private findTextNodes;
}

interface SelectionLimitingConfig extends CommonTargets {
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
declare class SelectionLimiting implements ProtectionModule {
    private config;
    private listeners;
    private checking;
    constructor(config: SelectionLimitingConfig);
    activate(): void;
    deactivate(): void;
    private checkSelection;
    private enforceLimit;
    private truncateRange;
}

interface ContentProtectionConfig {
    /** Global event callback — receives events from all modules */
    onEvent?: ProtectionEventCallback;
    /** Individual module configs. Omit a key to disable that module. */
    dragPrevention?: Omit<DragPreventionConfig, "onEvent">;
    printProtection?: Omit<PrintProtectionConfig, "onEvent">;
    copyProtection?: Omit<CopyProtectionConfig, "onEvent">;
    contextMenuProtection?: Omit<ContextMenuProtectionConfig, "onEvent">;
    keyboardProtection?: Omit<KeyboardProtectionConfig, "onEvent">;
    devToolsDetection?: Omit<DevToolsDetectionConfig, "onEvent">;
    textObfuscation?: Omit<TextObfuscationConfig, "onEvent">;
    linkUrlHiding?: LinkUrlHidingConfig;
    browserEnforcement?: Omit<BrowserEnforcementConfig, "onEvent">;
    screenshotDetection?: Omit<ScreenshotDetectionConfig, "onEvent">;
    watermarking?: WatermarkingConfig;
    selectionLimiting?: Omit<SelectionLimitingConfig, "onEvent">;
}
/**
 * Main orchestrator that initializes and manages all content protection modules.
 *
 * Usage:
 * ```ts
 * const protection = new ContentProtection({
 *   onEvent: (e) => console.log(e),
 *   dragPrevention: { contentElement: el, contentIframes: iframes },
 *   printProtection: { contentElement: el, protectedElements: [el, panel] },
 *   copyProtection: { contentElement: el, mode: "block" },
 *   // ... enable only what you need
 * });
 *
 * await protection.activate();
 * // later...
 * protection.deactivate();
 * ```
 */
declare class ContentProtection {
    private modules;
    private config;
    private eventLog;
    constructor(config: ContentProtectionConfig);
    private initModules;
    /** Activate all configured modules. Browser enforcement runs first (may throw). */
    activate(): Promise<void>;
    /** Deactivate all modules and restore original state */
    deactivate(): void;
    /** Get a specific module instance for advanced control */
    getModule<T extends ProtectionModule>(name: string): T | undefined;
    /** Get the copy protection module (for citation bypass control) */
    get copyProtection(): CopyProtection | undefined;
    /** Get the text obfuscation module (for reinitialize on page turn) */
    get textObfuscation(): TextObfuscation | undefined;
    /** Get the watermarking module (for reinitialize on page turn) */
    get watermarking(): Watermarking | undefined;
    /** Get all logged protection events */
    getEventLog(): readonly ProtectionEvent[];
    /** Clear the event log */
    clearEventLog(): void;
}

export { BrowserEnforcement, type BrowserEnforcementConfig, type CommonTargets, ContentProtection, type ContentProtectionConfig, ContextMenuProtection, type ContextMenuProtectionConfig, CopyProtection, type CopyProtectionConfig, DevToolsDetection, type DevToolsDetectionConfig, DragPrevention, type DragPreventionConfig, KeyboardProtection, type KeyboardProtectionConfig, LinkUrlHiding, type LinkUrlHidingConfig, PrintProtection, type PrintProtectionConfig, type ProtectionEvent, type ProtectionEventCallback, type ProtectionModule, ScreenshotDetection, type ScreenshotDetectionConfig, SelectionLimiting, type SelectionLimitingConfig, TextObfuscation, type TextObfuscationConfig, Watermarking, type WatermarkingConfig };
