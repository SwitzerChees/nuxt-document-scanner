/**
 * Module options TypeScript interface definition.
 */
export type DocumentScannerModuleOptions = {
  /**
   * Configuration for the video input.
   */
  videoOptions: {
    /**
     * Camera facing mode.
     *
     * Default: 'environment'
     */
    facingMode?: 'environment' | 'user'
    /**
     * Preferred camera stream long edge in pixels.
     *
     * Default: 3840
     */
    resolution?: number
    /**
     * Optional still photo capture after the full-resolution video burst.
     * The photo is accepted only when the document has stayed in place.
     */
    highResolutionCapture?: {
      /**
       * Enable photographic still capture where supported.
       *
       * Default: true
       */
      enabled?: boolean
      /**
       * Preferred still-photo long edge.
       *
       * Default: 3200
       */
      resolution?: number
      /**
       * Legacy option, retained for config compatibility; burst uses three frames.
       *
       * Default: 3
       */
      settleFrames?: number
      /**
       * Timeout in ms for the optional still photo.
       *
       * Default: 2500
       */
      timeout?: number
    }
  }

  /**
   * Worker and model configuration for ONNX inference.
   */
  worker: {
    /**
     * Path to the ONNX model file.
     *
     * Example: '/nuxt-document-scanner/v0.7.0/models/lcnet100_h_e_bifpn_256_fp32.onnx'
     */
    modelPath: string
    /**
     * Path to the ONNX runtime folder.
     *
     * Example: '/nuxt-document-scanner/v0.7.0/onnx/'
     */
    onnxPath: string
    /**
     * Input resolution for the model.
     *
     * Default: 256
     */
    modelResolution?: number
    /**
     * Inference backend.
     *
     * Default: 'wasm'
     */
    prefer?: 'webgpu' | 'wasm'
    /**
     * Model input tensor name.
     *
     * Default: 'img'
     */
    inputName?: string
    /**
     * Maximum side length for detection frames.
     *
     * Default: 512
     */
    detectionMaxSize?: number
  }

  /**
   * Auto-capture and stability configuration.
   */
  capture?: {
    /**
     * Auto-capture behavior configuration.
     */
    autoCapture?: {
      /**
       * Enable or disable automatic capture.
       *
       * Default: true
       */
      enabled?: boolean
      /**
       * Delay in ms before auto-capture triggers.
       *
       * Default: 1100
       */
      delay?: number
      /**
       * Cooldown in ms after each capture.
       *
       * Default: 700
       */
      cooldown?: number
    }
    /**
     * Duration in ms the document must stay stable.
     *
     * Default: 0
     */
    stableDuration?: number
    /**
     * Significant motion threshold (0.0-1.0).
     *
     * Default: 0.08
     */
    stableSignificantMotionThreshold?: number
    /**
     * Minor motion threshold (0.0-1.0).
     *
     * Default: 0.02
     */
    stableMotionThreshold?: number
    /**
     * Duration in ms before considering missed corners invalid.
     *
     * Default: 500
     */
    missedRectanglesDuration?: number
    /** Minimum complete-quad heatmap confidence required for auto-capture. */
    minimumDetectionConfidence?: number
    /** Minimum document polygon area relative to the camera frame. */
    minimumDocumentAreaRatio?: number
    /** Maximum supported document aspect ratio, including long receipts. */
    maximumDocumentAspectRatio?: number
    /** Default non-destructive processing profile. Default: 'document'. */
    processingProfile?:
      | 'original'
      | 'color'
      | 'document'
      | 'grayscale'
      | 'black-and-white'
    /** Maximum decoded output pixel count. Default: 8 megapixels. */
    maxOutputPixels?: number
    /** Maximum processed image long edge. Default: 3200px. */
    maxOutputLongEdge?: number
    /** JPEG quality used for processed page blobs. Default: 0.94. */
    jpegQuality?: number
    /** Maximum thumbnail long edge. Default: 360px. */
    thumbnailLongEdge?: number
  }
}
