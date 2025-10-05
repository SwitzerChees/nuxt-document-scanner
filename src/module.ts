import {
  defineNuxtModule,
  createResolver,
  addComponent,
  addImports,
} from '@nuxt/kit'

/**
 * Module options TypeScript interface definition
 */
export interface ModuleOptions {
  /**
   * Logging configuration
   */
  logging: {
    /**
     * Whether to enable logging
     *
     * Default: false
     */
    enabled: boolean
  }
  /**
   * DocAligner Model configuration
   */
  model: {
    /**
     * The name of the model to use
     *
     * Default: 'lcnet100_h_e_bifpn_256_fp32'
     */
    name: string // Model name (e.g., 'lcnet100_h_e_bifpn_256_fp32')
    /**
     * The custom model path to use
     *
     * Default: undefined
     */
    path?: string
  }

  /**
   * OpenCV configuration
   */
  openCV: {
    /**
     * The URL of the OpenCV library to use
     *
     * Default: '/opencv/opencv-4.8.0.js'
     */
    url: string
  }

  /**
   * ONNX Inference configuration
   */
  inference: {
    /**
     * The execution provider to use
     *
     * Default: 'webgpu'
     */
    prefer?: 'webgpu' | 'wasm'
    /**
     * The number of threads to use for the onnx runtime
     *
     * Default: 4
     */
    threads?: number
    /**
     * The resolution of the input image for the model
     *
     * Default: 256
     */
    targetResolution?: number
  }

  /**
   * Performance optimization settings
   */
  performance: {
    /**
     * The target frames per second for the main loop
     *
     * Default: 30
     */
    targetFps: number
    /**
     * The minimum frames to skip
     *
     * Default: 1
     */
    minFrameSkip: number
    /**
     * The maximum frames to skip
     *
     * Default: 1
     */
    maxFrameSkip: number
    /**
     * The number of frames needed to consider quad stable
     *
     * Default: 10
     */
    stableFramesThreshold: number // Frames needed to consider quad stable
    /**
     * Whether to use transferable objects for worker communication
     *
     * Default: true
     */
    useTransferableObjects: boolean
  }

  /**
   * Camera configuration
   */
  camera: {
    defaultResolution: number // Default camera resolution
    highResCapture: number // High resolution for final capture
    facingMode: 'environment' | 'user' // Camera facing mode
  }

  /**
   * Auto-capture configuration (optional)
   */
  autoCapture: {
    enabled: boolean // Enable auto-capture
    stableFramesRequired: number // Frames quad must be stable
    motionThreshold: number // Motion detection sensitivity (pixels)
    countdownDuration: number // Countdown duration in ms
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-document-scanner',
    configKey: 'nuxtDocumentScanner',
  },
  // Default configuration options of the Nuxt module
  defaults: {
    logging: {
      enabled: false,
    },
    model: {
      name: 'lcnet100_h_e_bifpn_256_fp32',
    },
    inference: {
      prefer: 'webgpu',
      threads: 1,
      targetResolution: 256,
    },
    performance: {
      targetFps: 30, // The calculated target frames per second for the main loop
      minFrameSkip: 1, // The minimum frames to skip
      maxFrameSkip: 8, // The maximum frames to skip
      stableFramesThreshold: 20, // The number of frames to consider quad stable
      useTransferableObjects: true, // Enable zero-copy transfers
    },
    openCV: {
      url: '/opencv/opencv-4.8.0.js',
    },
    camera: {
      defaultResolution: 720, // Preview resolution (1080p for performance)
      highResCapture: 3840, // 4K for high-quality capture
      facingMode: 'environment',
    },
    autoCapture: {
      enabled: true,
      countdownDuration: 1000, // the time to wait before auto-capture
      stableFramesRequired: 24, // amount of frames to consider quad stable, lower means faster lock
      motionThreshold: 15, // the lower the more sensitive for movings, the higher the less sensitive for movings
    },
  },
  setup(_options, _nuxt) {
    const resolver = createResolver(import.meta.url)

    _nuxt.hook('nitro:config', (nitroConfig) => {
      nitroConfig.publicAssets ||= []
      nitroConfig.publicAssets.push({
        dir: resolver.resolve('./runtime/public'),
        maxAge: 60 * 60 * 24 * 365,
      })
    })

    addComponent({
      name: 'DocumentScanner',
      filePath: resolver.resolve('runtime/components/DocumentScanner'),
    })

    addComponent({
      name: 'DocumentScannerCamera',
      filePath: resolver.resolve('runtime/components/DocumentScannerCamera'),
    })

    addComponent({
      name: 'DocumentScannerPreview',
      filePath: resolver.resolve('runtime/components/DocumentScannerPreview'),
    })

    addComponent({
      name: 'DocumentScannerControl',
      filePath: resolver.resolve('runtime/components/DocumentScannerControl'),
    })

    addComponent({
      name: 'DocumentScannerTopControl',
      filePath: resolver.resolve(
        'runtime/components/DocumentScannerTopControl',
      ),
    })

    addComponent({
      name: 'DocumentScannerEdges',
      filePath: resolver.resolve('runtime/components/DocumentScannerEdges'),
    })

    addComponent({
      name: 'DocumentScannerOverlay',
      filePath: resolver.resolve('runtime/components/DocumentScannerOverlay'),
    })

    addComponent({
      name: 'DocumentScannerHeatmaps',
      filePath: resolver.resolve('runtime/components/DocumentScannerHeatmaps'),
    })

    addImports({
      as: 'useCamera',
      from: resolver.resolve('./runtime/composables/useCamera'),
      name: 'useCamera',
    })

    addImports({
      as: 'useDocumentScanner',
      from: resolver.resolve('./runtime/composables/useDocumentScanner'),
      name: 'useDocumentScanner',
    })

    // Make module options available at runtime
    _nuxt.options.runtimeConfig.public.documentScanner = _options as any
  },
})
