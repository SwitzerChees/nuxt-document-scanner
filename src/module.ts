import {
  defineNuxtModule,
  addPlugin,
  createResolver,
  addComponent,
  addImports,
} from '@nuxt/kit'

// Module options TypeScript interface definition
export interface ModuleOptions {
  /**
   * DocAligner Model configuration
   */
  model: {
    name: string // Model name (e.g., 'lcnet100_h_e_bifpn_256_fp32')
    version?: string | null // Not used for DocAligner models
    path?: string // Custom model path
  }

  /**
   * ONNX Inference configuration
   */
  inference: {
    prefer: 'webgpu' | 'wasm'
    threads?: number
    targetResolution: number // Inference resolution (256 for DocAligner)
  }

  /**
   * Performance optimization settings
   */
  performance: {
    targetFps: number // Target frames per second (adaptive frame skipping)
    minFrameSkip: number // Minimum frames to skip
    maxFrameSkip: number // Maximum frames to skip
    stableFramesThreshold: number // Frames needed to consider quad stable
    useTransferableObjects: boolean // Use transferable objects for worker communication
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
    model: {
      name: 'lcnet100_h_e_bifpn_256_fp32', // DocAligner heatmap model
      version: null, // Not used for DocAligner models
    },
    inference: {
      prefer: 'webgpu',
      threads: 4,
      targetResolution: 256, // DocAligner uses 256x256 input
    },
    performance: {
      targetFps: 30, // Target 30 FPS
      minFrameSkip: 1, // At least skip 1 frame (process every 2nd)
      maxFrameSkip: 6, // At most skip 6 frames when stable
      stableFramesThreshold: 10, // Frames to consider quad stable
      useTransferableObjects: true, // Enable zero-copy transfers
    },
    camera: {
      defaultResolution: 720, // Preview resolution (1080p for performance)
      highResCapture: 3840, // 4K for high-quality capture
      facingMode: 'environment',
    },
    autoCapture: {
      enabled: true,
      stableFramesRequired: 15, // 15 frames (~500ms at 30fps) - fast but stable
      motionThreshold: 10, // 5 pixels avg movement - more sensitive for faster lock
      countdownDuration: 1000, // 1 second countdown
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

    // Do not add the extension since the `.ts` will be transpiled to `.mjs` after `npm run prepack`
    addPlugin(resolver.resolve('./runtime/plugin'))

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
