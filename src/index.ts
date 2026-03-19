/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

// Main orchestrator
export { ContentProtection, type ContentProtectionConfig } from "./content-protection";

// Types
export type {
  ProtectionModule,
  ProtectionEvent,
  ProtectionEventCallback,
  CommonTargets,
} from "./types";

// Individual modules (for standalone use)
export { DragPrevention, type DragPreventionConfig } from "./modules/drag-prevention";
export { PrintProtection, type PrintProtectionConfig } from "./modules/print-protection";
export { CopyProtection, type CopyProtectionConfig } from "./modules/copy-protection";
export { ContextMenuProtection, type ContextMenuProtectionConfig } from "./modules/context-menu-protection";
export { KeyboardProtection, type KeyboardProtectionConfig } from "./modules/keyboard-protection";
export { DevToolsDetection, type DevToolsDetectionConfig } from "./modules/devtools-detection";
export { TextObfuscation, type TextObfuscationConfig } from "./modules/text-obfuscation";
export { LinkUrlHiding, type LinkUrlHidingConfig } from "./modules/link-url-hiding";
export { BrowserEnforcement, type BrowserEnforcementConfig } from "./modules/browser-enforcement";
export { ScreenshotDetection, type ScreenshotDetectionConfig } from "./modules/screenshot-detection";
export { Watermarking, type WatermarkingConfig } from "./modules/watermarking";
export { SelectionLimiting, type SelectionLimitingConfig } from "./modules/selection-limiting";
export { ImageProtection, type ImageProtectionConfig } from "./modules/image-protection";
export { AntiAutomation, type AntiAutomationConfig } from "./modules/anti-automation";
export { SpeechSynthesisBlocking, type SpeechSynthesisBlockingConfig } from "./modules/speech-synthesis-blocking";
export { ContentExpiration, type ContentExpirationConfig } from "./modules/content-expiration";
