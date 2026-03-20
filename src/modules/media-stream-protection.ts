/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 * Licensed under the Apache License, Version 2.0
 */

import type { ProtectionModule, ProtectionEventCallback } from "../types";

// captureStream is not yet in TypeScript's DOM lib
declare global {
  interface HTMLMediaElement {
    captureStream(): MediaStream;
  }
  interface HTMLCanvasElement {
    captureStream(frameRequestRate?: number): MediaStream;
  }
}

export interface MediaStreamProtectionConfig {
  /** Root element containing media to protect */
  contentRoot: HTMLElement;
  /** Optional iframes containing media */
  contentIframes?: HTMLIFrameElement[];
  /**
   * Chunk size in bytes for MediaSource segments.
   * Smaller = harder to reconstruct, but more requests.
   * Default: 512KB
   */
  chunkSize?: number;
  /** MIME type for audio segments (default: audio/mpeg) */
  audioMimeType?: string;
  /** MIME type for video segments (default: video/mp4; codecs="avc1.42E01E,mp4a.40.2") */
  videoMimeType?: string;
  /** Intercept MediaRecorder to prevent stream capture */
  blockMediaRecorder?: boolean;
  /** Intercept AudioContext to prevent audio stream capture */
  blockAudioCapture?: boolean;
  /** Intercept captureStream() on canvas/media elements */
  blockCaptureStream?: boolean;
  /** Intercept getDisplayMedia() — blocks screen recording/capture API */
  blockDisplayCapture?: boolean;
  onEvent?: ProtectionEventCallback;
}

export class MediaStreamProtection implements ProtectionModule {
  private config: MediaStreamProtectionConfig;
  private originalMediaRecorder: typeof MediaRecorder | null = null;
  private originalCreateMediaStreamSource:
    | typeof AudioContext.prototype.createMediaStreamSource
    | null = null;
  private originalCreateMediaElementSource:
    | typeof AudioContext.prototype.createMediaElementSource
    | null = null;
  private originalCaptureStream: typeof HTMLMediaElement.prototype.captureStream | null = null;
  private originalCanvasCaptureStream:
    | typeof HTMLCanvasElement.prototype.captureStream
    | null = null;
  private originalGetDisplayMedia: typeof navigator.mediaDevices.getDisplayMedia | null = null;

  constructor(config: MediaStreamProtectionConfig) {
    this.config = {
      chunkSize: 512 * 1024,
      audioMimeType: "audio/mpeg",
      videoMimeType: 'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
      blockMediaRecorder: true,
      blockAudioCapture: true,
      blockCaptureStream: true,
      blockDisplayCapture: true,
      ...config,
    };
  }

  activate(): void {
    if (this.config.blockMediaRecorder) {
      this.interceptMediaRecorder();
    }
    if (this.config.blockAudioCapture) {
      this.interceptAudioCapture();
    }
    if (this.config.blockCaptureStream) {
      this.interceptCaptureStream();
    }
    if (this.config.blockDisplayCapture) {
      this.interceptGetDisplayMedia();
    }
  }

  deactivate(): void {
    // Restore MediaRecorder
    if (this.originalMediaRecorder) {
      (window as any).MediaRecorder = this.originalMediaRecorder;
      this.originalMediaRecorder = null;
    }

    // Restore AudioContext methods
    if (this.originalCreateMediaStreamSource) {
      AudioContext.prototype.createMediaStreamSource = this.originalCreateMediaStreamSource;
      this.originalCreateMediaStreamSource = null;
    }
    if (this.originalCreateMediaElementSource) {
      AudioContext.prototype.createMediaElementSource = this.originalCreateMediaElementSource;
      this.originalCreateMediaElementSource = null;
    }

    // Restore captureStream
    if (this.originalCaptureStream) {
      HTMLMediaElement.prototype.captureStream = this.originalCaptureStream;
      this.originalCaptureStream = null;
    }
    if (this.originalCanvasCaptureStream) {
      HTMLCanvasElement.prototype.captureStream = this.originalCanvasCaptureStream;
      this.originalCanvasCaptureStream = null;
    }

    // Restore getDisplayMedia
    if (this.originalGetDisplayMedia && navigator.mediaDevices) {
      navigator.mediaDevices.getDisplayMedia = this.originalGetDisplayMedia;
      this.originalGetDisplayMedia = null;
    }
  }

  /**
   * Intercept MediaRecorder constructor.
   * Any attempt to create a MediaRecorder (used by recording extensions/scripts)
   * is blocked and reported.
   */
  private interceptMediaRecorder(): void {
    if (typeof MediaRecorder === "undefined") return;

    this.originalMediaRecorder = MediaRecorder;
    const self = this;

    // Replace with a proxy that blocks recording of protected streams
    (window as any).MediaRecorder = class BlockedMediaRecorder {
      constructor(stream: MediaStream, _options?: MediaRecorderOptions) {
        self.config.onEvent?.({
          type: "media_stream_blocked",
          timestamp: Date.now(),
          detail: `MediaRecorder blocked — ${stream.getTracks().length} tracks`,
        });

        // Throw a DOMException similar to what browsers throw for DRM content
        throw new DOMException(
          "Failed to construct 'MediaRecorder': The MediaRecorder failed to start because the stream is protected.",
          "NotSupportedError"
        );
      }

      // Static methods for compatibility
      static isTypeSupported(mimeType: string): boolean {
        return self.originalMediaRecorder!.isTypeSupported(mimeType);
      }
    };
  }

  /**
   * Intercept AudioContext.createMediaStreamSource and createMediaElementSource.
   * Prevents routing protected audio through Web Audio API for capture.
   */
  private interceptAudioCapture(): void {
    if (typeof AudioContext === "undefined") return;

    const self = this;

    // Block createMediaElementSource for protected elements
    this.originalCreateMediaElementSource =
      AudioContext.prototype.createMediaElementSource;
    const origCreateElement = this.originalCreateMediaElementSource;

    AudioContext.prototype.createMediaElementSource = function (
      mediaElement: HTMLMediaElement
    ): MediaElementAudioSourceNode {
      // Check if this element is within a protected root
      if (self.isProtectedElement(mediaElement)) {
        self.config.onEvent?.({
          type: "media_stream_blocked",
          timestamp: Date.now(),
          detail: `createMediaElementSource blocked on ${mediaElement.tagName.toLowerCase()}`,
        });
        throw new DOMException(
          "Failed to execute 'createMediaElementSource': The media element is protected.",
          "InvalidStateError"
        );
      }
      return origCreateElement.call(this, mediaElement);
    };

    // Block createMediaStreamSource (captures from streams)
    this.originalCreateMediaStreamSource =
      AudioContext.prototype.createMediaStreamSource;
    const origCreateStream = this.originalCreateMediaStreamSource;

    AudioContext.prototype.createMediaStreamSource = function (
      stream: MediaStream
    ): MediaStreamAudioSourceNode {
      self.config.onEvent?.({
        type: "media_stream_blocked",
        timestamp: Date.now(),
        detail: "createMediaStreamSource intercepted",
      });
      // Allow it — we can't determine if the stream is from a protected element
      // But we log it for the host application to handle
      return origCreateStream.call(this, stream);
    };
  }

  /**
   * Intercept captureStream() on HTMLMediaElement and HTMLCanvasElement.
   * Prevents creating a MediaStream from protected content.
   */
  private interceptCaptureStream(): void {
    const self = this;

    // HTMLMediaElement.captureStream()
    if (HTMLMediaElement.prototype.captureStream) {
      this.originalCaptureStream = HTMLMediaElement.prototype.captureStream;
      const origCapture = this.originalCaptureStream;

      HTMLMediaElement.prototype.captureStream = function (): MediaStream {
        if (self.isProtectedElement(this)) {
          self.config.onEvent?.({
            type: "media_stream_blocked",
            timestamp: Date.now(),
            detail: `captureStream blocked on ${this.tagName.toLowerCase()}`,
          });
          throw new DOMException(
            "Failed to execute 'captureStream': The element is protected.",
            "NotSupportedError"
          );
        }
        return origCapture.call(this);
      };
    }

    // HTMLCanvasElement.captureStream()
    if (HTMLCanvasElement.prototype.captureStream) {
      this.originalCanvasCaptureStream = HTMLCanvasElement.prototype.captureStream;
      const origCanvasCapture = this.originalCanvasCaptureStream;

      HTMLCanvasElement.prototype.captureStream = function (
        frameRequestRate?: number
      ): MediaStream {
        // Check if canvas is within protected root
        if (self.isProtectedElement(this)) {
          self.config.onEvent?.({
            type: "media_stream_blocked",
            timestamp: Date.now(),
            detail: "canvas captureStream blocked",
          });
          throw new DOMException(
            "Failed to execute 'captureStream': The canvas is protected.",
            "NotSupportedError"
          );
        }
        return origCanvasCapture.call(this, frameRequestRate!);
      };
    }
  }

  /**
   * Intercept navigator.mediaDevices.getDisplayMedia().
   * This is the Screen Capture API — used by all modern screen recording tools,
   * browser extensions, and web-based capture services.
   */
  private interceptGetDisplayMedia(): void {
    if (!navigator.mediaDevices?.getDisplayMedia) return;

    this.originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(
      navigator.mediaDevices
    );
    const self = this;

    navigator.mediaDevices.getDisplayMedia = function (
      constraints?: DisplayMediaStreamOptions
    ): Promise<MediaStream> {
      self.config.onEvent?.({
        type: "media_stream_blocked",
        timestamp: Date.now(),
        detail: "getDisplayMedia blocked — screen capture attempt",
      });

      return Promise.reject(
        new DOMException(
          "Failed to execute 'getDisplayMedia': Screen capture is not permitted on this page.",
          "NotAllowedError"
        )
      );
    };
  }

  /** Check if an element is within a protected content root */
  private isProtectedElement(el: Element): boolean {
    if (this.config.contentRoot.contains(el)) return true;

    if (this.config.contentIframes) {
      for (const iframe of this.config.contentIframes) {
        try {
          if (iframe.contentDocument?.body?.contains(el)) return true;
        } catch {
          // cross-origin
        }
      }
    }
    return false;
  }
}
