import {
  defineNuxtModule,
  createResolver,
  addComponent,
  addImports,
} from '@nuxt/kit'

/**
 * Module options TypeScript interface definition
 */
export type DocumentScannerModuleOptions = {
  /**
   * Configuration for the video input
   */
  videoOptions: {
    /**
     * Camera facing mode
     *
     * Default: 'environment'
     */
    facingMode?: 'environment' | 'user'
    /**
     * Camera resolution in pixels
     *
     * Default: 1920
     */
    resolution?: number
  }

  /**
   * URL of the OpenCV script
   *
   * Default: '/nuxt-document-scanner/opencv/opencv-4.8.0.js'
   */
  opencvUrl?: string

  /**
   * Worker and model configuration for ONNX inference
   */
  worker: {
    /**
     * Path to the ONNX model file
     *
     * Example: '/nuxt-document-scanner/models/lcnet100_h_e_bifpn_256_fp32.onnx'
     */
    modelPath: string
    /**
     * Path to the ONNX runtime folder
     *
     * Example: '/nuxt-document-scanner/onnx/'
     */
    onnxPath: string
    /**
     * Input resolution for the model
     *
     * Default: 256
     */
    modelResolution?: number
    /**
     * Inference backend
     *
     * Default: 'webgpu'
     */
    prefer?: 'webgpu' | 'wasm'
    /**
     * Model input tensor name
     *
     * Default: 'img'
     */
    threads?: number
    /**
     * Model input tensor name
     *
     * Default: 'img'
     */
    inputName?: string
  }

  /**
   * Auto-capture and stability configuration
   */
  capture?: {
    /**
     * Auto-capture behavior configuration
     */
    autoCapture?: {
      /**
       * Enable or disable automatic capture
       *
       * Default: true
       */
      enabled?: boolean
      /**
       * Delay in ms before auto-capture triggers
       *
       * Default: 1000
       */
      delay?: number
      /**
       * Cooldown in ms after each capture
       *
       * Default: 2500
       */
      cooldown?: number
    }
    /**
     * Duration in ms the document must stay stable
     *
     * Default: 1800
     */
    stableDuration?: number
    /**
     * Significant motion threshold (0.0–1.0)
     *
     * Default: 0.3
     */
    stableSignificantMotionThreshold?: number
    /**
     * Minor motion threshold (0.0–1.0)
     *
     * Default: 0.3
     */
    stableMotionThreshold?: number
    /**
     * Duration in ms before considering missed corners invalid
     *
     * Default: 500
     */
    missedRectanglesDuration?: number
  }
}

export default defineNuxtModule<DocumentScannerModuleOptions>({
  meta: {
    name: 'nuxt-document-scanner',
    configKey: 'nuxtDocumentScanner',
  },
  // Default configuration options of the Nuxt module
  defaults: {
    videoOptions: {
      facingMode: 'environment',
      resolution: 1920,
    },
    opencvUrl: '/nuxt-document-scanner/opencv/opencv-4.8.0.js',
    worker: {
      modelPath:
        '/nuxt-document-scanner/models/lcnet100_h_e_bifpn_256_fp32.onnx',
      onnxPath: '/nuxt-document-scanner/onnx/',
      modelResolution: 256,
      prefer: 'webgpu',
      threads: 1,
      inputName: 'img',
    },
    capture: {
      autoCapture: {
        enabled: true,
        delay: 1000,
        cooldown: 2500,
      },
      stableDuration: 1800,
      stableSignificantMotionThreshold: 0.3,
      stableMotionThreshold: 0.3,
      missedRectanglesDuration: 500,
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

    addImports({
      as: 'useDocumentScanner',
      from: resolver.resolve('./runtime/composables/useDocumentScanner'),
      name: 'useDocumentScanner',
    })

    // Make module options available at runtime
    _nuxt.options.runtimeConfig.public.documentScanner = _options as any
  },
})
