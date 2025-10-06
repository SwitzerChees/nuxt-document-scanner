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
    name: string
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
     * Default: '/nuxt-document-scanner/opencv/opencv-4.8.0.js'
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
   * Camera configuration
   */
  camera: {
    /**
     * The resolution of the camera to use for tracking the document corners
     *
     * Default: 480
     */
    trackingResolution: number
    /**
     * The resolution of the camera to use for capturing the document
     *
     * Default: 3840
     */
    captureResolution: number
    /**
     * The facing mode of the camera
     *
     * Default: 'environment'
     */
    facingMode: 'environment' | 'user'
  }

  /**
   * Capture configuration (optional)
   */
  capture: {
    /**
     * Enable auto-capture
     *
     * Default: true
     */
    autoCapture: boolean
    /**
     * Duration in ms that quad must be stable
     *
     * Default: 1000
     */
    stableDuration: number
    /**
     * Motion detection sensitivity (pixels)
     *
     * Default: 20
     */
    motionThreshold: number
    /**
     * Countdown duration in ms
     *
     * Default: 1000
     */
    countdownDuration: number
    /**
     * Smoothing alpha for the overlay
     *
     * Lower means the overlay moves faster towards the target quad
     *
     * Default: 0.25
     */
    overlaySmoothingAlpha: number
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
    openCV: {
      url: '/nuxt-document-scanner/opencv/opencv-4.8.0.js',
    },
    camera: {
      trackingResolution: 480,
      captureResolution: 3840,
      facingMode: 'environment',
    },
    capture: {
      autoCapture: true,
      countdownDuration: 1000,
      stableDuration: 1000,
      motionThreshold: 20,
      overlaySmoothingAlpha: 0.25,
    },
  },
  setup(_options, _nuxt) {
    const resolver = createResolver(import.meta.url)

    const dir = resolver.resolve('runtime/public')
    if (!dir) return

    _nuxt.hook('nitro:config', (nitroConfig) => {
      nitroConfig.publicAssets ||= []
      nitroConfig.publicAssets.push({
        dir,
        baseURL: 'nuxt-document-scanner',
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
