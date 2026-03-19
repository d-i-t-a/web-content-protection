/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

/** Base interface for all protection modules */
export interface ProtectionModule {
  activate(): void | Promise<void>;
  deactivate(): void;
}

/** Callback when a protection event occurs */
export type ProtectionEventCallback = (event: ProtectionEvent) => void;

export interface ProtectionEvent {
  type:
    | "copy_blocked"
    | "copy_restricted"
    | "print_blocked"
    | "drag_blocked"
    | "context_menu_blocked"
    | "key_blocked"
    | "devtools_detected"
    | "tamper_detected"
    | "visibility_change"
    | "screenshot_suspected"
    | "browser_unsupported";
  timestamp: number;
  detail?: string;
}

/** Common config shared across modules */
export interface CommonTargets {
  contentElement: HTMLElement;
  additionalElements?: HTMLElement[];
  contentIframes?: HTMLIFrameElement[];
}
