import {
  defineNuxtModule,
  createResolver,
  addComponent,
  addImports,
} from '@nuxt/kit'
import type { DocumentScannerModuleOptions } from './runtime/types'

export type { DocumentScannerModuleOptions } from './runtime/types'

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
      highResolutionCapture: {
        enabled: false,
        resolution: 1920,
        settleFrames: 3,
        timeout: 1800,
      },
    },
    opencvUrl: '/nuxt-document-scanner/opencv/opencv-4.8.0.js',
    worker: {
      modelPath:
        '/nuxt-document-scanner/models/lcnet100_h_e_bifpn_256_fp32.onnx',
      onnxPath: '/nuxt-document-scanner/onnx/',
      modelResolution: 256,
      prefer: 'wasm',
      threads: 1,
      inputName: 'img',
      detectionMaxSize: 512,
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

    _nuxt.options.css ||= []
    _nuxt.options.css.push(resolver.resolve('runtime/scanner.css'))

    _nuxt.options.vite ||= {}
    _nuxt.options.vite.server ||= {}
    _nuxt.options.vite.server.headers = {
      ...(_nuxt.options.vite.server.headers || {}),
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
    }
    _nuxt.options.vite.preview ||= {}
    _nuxt.options.vite.preview.headers = {
      ...(_nuxt.options.vite.preview.headers || {}),
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
    }
    _nuxt.options.vite.resolve ||= {}
    const conditions = new Set(_nuxt.options.vite.resolve.conditions || [])
    conditions.add('onnxruntime-web-use-extern-wasm')
    _nuxt.options.vite.resolve.conditions = Array.from(conditions)

    _nuxt.options.vite.optimizeDeps ||= {}
    const optimizeDeps = new Set(_nuxt.options.vite.optimizeDeps.include || [])
    optimizeDeps.add('onnxruntime-web/wasm')
    _nuxt.options.vite.optimizeDeps.include = Array.from(optimizeDeps)
    const excludedDeps = new Set(_nuxt.options.vite.optimizeDeps.exclude || [])
    excludedDeps.add('pdf-lib')
    _nuxt.options.vite.optimizeDeps.exclude = Array.from(excludedDeps)

    _nuxt.hook('nitro:config' as any, (nitroConfig: any) => {
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

    addImports([
      {
        as: 'createPdfFromDocument',
        from: resolver.resolve('./runtime/utils/pdf'),
        name: 'createPdfFromDocument',
      },
      {
        as: 'createPdfFileFromDocument',
        from: resolver.resolve('./runtime/utils/pdf'),
        name: 'createPdfFileFromDocument',
      },
    ])

    // Make module options available at runtime
    _nuxt.options.runtimeConfig.public.documentScanner = _options as any
  },
})
