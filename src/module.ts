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
    targetResolution: number // Inference resolution for all devices
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
    maxAreaPercent: number // Maximum quad area as % of frame
    minRectangularity: number // Minimum rectangularity score (0-1)
    useContours: boolean // Use contour detection (primary method)
    smoothingAlpha: number // EMA smoothing factor (0-1, higher = less smooth but faster response)
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
      name: 'pidinet',
      version: 'tiny',
    },
    inference: {
      prefer: 'webgpu',
      threads: 4,
      targetResolution: 192, // Higher resolution for better edge detection (balance of quality/speed)
    },
    edgeDetection: {
      threshold: 0.35, // Balanced edge detection threshold
      houghThreshold: 40, // Higher threshold for cleaner line detection
      minLineLength: 30, // Longer lines for better document edge detection
      maxLineGap: 20, // Moderate gap tolerance
      minAreaPercent: 0.08, // 8% minimum - allows documents from distance
      maxAreaPercent: 0.92, // 92% maximum - leaves room for camera shake
      minRectangularity: 0.7, // Strict rectangularity requirement (70% perfect rectangle)
      useContours: true, // Enable contour detection (primary method)
      smoothingAlpha: 0.5, // Balanced smoothing for stability
    },
    performance: {
      targetFps: 30, // Target 30 FPS
      minFrameSkip: 1, // At least skip 1 frame (process every 2nd)
      maxFrameSkip: 6, // At most skip 6 frames when stable
      stableFramesThreshold: 10, // Frames to consider quad stable
      useTransferableObjects: true, // Enable zero-copy transfers
    },
    camera: {
      defaultResolution: 3840, // 4K by default (camera will use what it can)
      highResCapture: 3840, // 4K for final capture (not used anymore - we use current resolution)
      facingMode: 'environment',
    },
    autoCapture: {
      enabled: true,
      stableFramesRequired: 10, // 15 frames (~500ms at 30fps) - fast but stable
      motionThreshold: 50, // 5 pixels avg movement - more sensitive for faster lock
      countdownDuration: 500, // 1 second countdown
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
