/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule, ProtectionEventCallback } from "../types";

export interface SpeechSynthesisBlockingConfig {
  /** Block completely or allow with limited text length */
  mode: "block" | "restrict";
  /** Max characters allowed per utterance in restrict mode */
  maxCharacters?: number;
  onEvent?: ProtectionEventCallback;
}

export class SpeechSynthesisBlocking implements ProtectionModule {
  private config: SpeechSynthesisBlockingConfig;
  private originalSpeak: typeof speechSynthesis.speak | null = null;
  private originalGetSelection: typeof document.getSelection | null = null;

  constructor(config: SpeechSynthesisBlockingConfig) {
    this.config = {
      maxCharacters: 500,
      ...config,
    };
  }

  activate(): void {
    if (typeof speechSynthesis === "undefined") return;

    // Intercept speechSynthesis.speak
    this.originalSpeak = speechSynthesis.speak.bind(speechSynthesis);

    speechSynthesis.speak = (utterance: SpeechSynthesisUtterance): void => {
      if (this.config.mode === "block") {
        this.config.onEvent?.({
          type: "speech_blocked",
          timestamp: Date.now(),
          detail: `blocked ${utterance.text.length} chars`,
        });
        return; // silently block
      }

      if (this.config.mode === "restrict") {
        const max = this.config.maxCharacters ?? 500;
        if (utterance.text.length > max) {
          // Create a new utterance with truncated text
          const truncated = new SpeechSynthesisUtterance(
            utterance.text.substring(0, max)
          );
          truncated.lang = utterance.lang;
          truncated.pitch = utterance.pitch;
          truncated.rate = utterance.rate;
          truncated.voice = utterance.voice;
          truncated.volume = utterance.volume;

          this.config.onEvent?.({
            type: "speech_blocked",
            timestamp: Date.now(),
            detail: `restricted ${utterance.text.length} → ${max} chars`,
          });

          this.originalSpeak!(truncated);
          return;
        }
      }

      this.originalSpeak!(utterance);
    };
  }

  deactivate(): void {
    if (this.originalSpeak && typeof speechSynthesis !== "undefined") {
      speechSynthesis.speak = this.originalSpeak;
      this.originalSpeak = null;
    }
  }
}
