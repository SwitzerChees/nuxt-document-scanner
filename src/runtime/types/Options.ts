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
     * Default: 1920
     */
    resolution?: number
  }

  /**
   * URL of the OpenCV script.
   *
   * Default: '/nuxt-document-scanner/opencv/opencv-4.8.0.js'
   */
  opencvUrl?: string

  /**
   * Worker and model configuration for ONNX inference.
   */
  worker: {
    /**
     * Path to the ONNX model file.
     *
     * Example: '/nuxt-document-scanner/models/lcnet100_h_e_bifpn_256_fp32.onnx'
     */
    modelPath: string
    /**
     * Path to the ONNX runtime folder.
     *
     * Example: '/nuxt-document-scanner/onnx/'
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
     * WASM thread count.
     *
     * Default: 1
     */
    threads?: number
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
       * Default: 1000
       */
      delay?: number
      /**
       * Cooldown in ms after each capture.
       *
       * Default: 2500
       */
      cooldown?: number
    }
    /**
     * Duration in ms the document must stay stable.
     *
     * Default: 1800
     */
    stableDuration?: number
    /**
     * Significant motion threshold (0.0-1.0).
     *
     * Default: 0.3
     */
    stableSignificantMotionThreshold?: number
    /**
     * Minor motion threshold (0.0-1.0).
     *
     * Default: 0.3
     */
    stableMotionThreshold?: number
    /**
     * Duration in ms before considering missed corners invalid.
     *
     * Default: 500
     */
    missedRectanglesDuration?: number
  }
}
