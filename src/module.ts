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
   * ONNX Model configuration
   */
  model: {
    name: string
    version: 'tiny' | 'small' | 'large'
    path?: string // Custom model path
  }

  /**
   * ONNX Inference configuration
   */
  inference: {
    prefer: 'webgpu' | 'wasm'
    threads?: number
    targetResolution: number // Desktop inference resolution
    mobileResolution: number // Mobile inference resolution
  }

  /**
   * Edge detection and quad detection parameters
   */
  edgeDetection: {
    threshold: number // ONNX edge detection threshold (0-1)
    houghThreshold: number // Hough line detection threshold
    minLineLength: number // Minimum line length in pixels
    maxLineGap: number // Maximum gap between line segments
    minAreaPercent: number // Minimum quad area as % of frame
    smoothingAlpha: number // EMA smoothing factor (0-1)
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
  autoCapture?: {
    enabled: boolean // Enable auto-capture
    stableFramesRequired: number // Frames quad must be stable
    motionThreshold: number // Motion detection sensitivity
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
      name: 'pidinet',
      version: 'tiny',
    },
    inference: {
      prefer: 'wasm',
      threads: 4,
      targetResolution: 384,
      mobileResolution: 256,
    },
    edgeDetection: {
      threshold: 0.5,
      houghThreshold: 50,
      minLineLength: 50,
      maxLineGap: 10,
      minAreaPercent: 0.03,
      smoothingAlpha: 0.3,
    },
    camera: {
      defaultResolution: 640,
      highResCapture: 3840,
      facingMode: 'environment',
    },
    autoCapture: {
      enabled: false,
      stableFramesRequired: 30,
      motionThreshold: 8,
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
    _nuxt.options.runtimeConfig.public.documentScanner = _options
  },
})
