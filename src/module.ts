import {
  defineNuxtModule,
  createResolver,
  addComponent,
  addImports,
} from '@nuxt/kit'
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import type { DocumentScannerModuleOptions } from './runtime/types'

export type { DocumentScannerModuleOptions } from './runtime/types'

const RUNTIME_ASSET_VERSION = 'v0.6.0'
const RUNTIME_ASSET_BASE = `/nuxt-document-scanner/${RUNTIME_ASSET_VERSION}`
const RUNTIME_ASSETS = [
  'manifest.json',
  'models/LICENSE',
  'models/lcnet100_h_e_bifpn_256_fp32.onnx',
  'onnx/ort-wasm.wasm',
  'onnx/ort-wasm-simd.wasm',
] as const

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
        enabled: true,
        resolution: 1920,
        settleFrames: 3,
        timeout: 1800,
      },
    },
    worker: {
      modelPath:
        `${RUNTIME_ASSET_BASE}/models/lcnet100_h_e_bifpn_256_fp32.onnx`,
      onnxPath: `${RUNTIME_ASSET_BASE}/onnx/`,
      modelResolution: 256,
      prefer: 'wasm',
      inputName: 'img',
      detectionMaxSize: 256,
    },
    capture: {
      autoCapture: {
        enabled: true,
        delay: 1400,
        cooldown: 4500,
      },
      stableDuration: 900,
      stableSignificantMotionThreshold: 0.055,
      stableMotionThreshold: 0.012,
      missedRectanglesDuration: 500,
      minimumDetectionConfidence: 0.45,
      minimumDocumentAreaRatio: 0.02,
      maximumDocumentAspectRatio: 12,
      processingProfile: 'document',
      maxOutputPixels: 8_000_000,
      maxOutputLongEdge: 3200,
      jpegQuality: 0.9,
      thumbnailLongEdge: 360,
    },
  },
  setup(_options, _nuxt) {
    const resolver = createResolver(import.meta.url)

    const dir = resolver.resolve('runtime/public')
    if (!dir) return
    const stagingKey = createHash('sha1')
      .update(_nuxt.options.rootDir)
      .digest('hex')
      .slice(0, 12)
    const stagedAssets = resolvePath(
      tmpdir(),
      'nuxt-document-scanner-assets',
      stagingKey,
      RUNTIME_ASSET_VERSION,
    )

    _nuxt.options.vite ||= {}
    _nuxt.options.vite.server ||= {}
    _nuxt.options.vite.preview ||= {}
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
      rmSync(stagedAssets, { recursive: true, force: true })
      for (const relativePath of RUNTIME_ASSETS) {
        const target = resolvePath(stagedAssets, relativePath)
        mkdirSync(dirname(target), { recursive: true })
        copyFileSync(resolvePath(dir, relativePath), target)
      }
      nitroConfig.publicAssets ||= []
      nitroConfig.publicAssets.push({
        dir: stagedAssets,
        baseURL: `nuxt-document-scanner/${RUNTIME_ASSET_VERSION}`,
        maxAge: 60 * 60 * 24 * 365,
      })
      nitroConfig.routeRules ||= {}
      nitroConfig.routeRules[`${RUNTIME_ASSET_BASE}/models/**`] = {
        headers: {
          'content-type': 'application/octet-stream',
          'cache-control': 'public, max-age=31536000, immutable',
        },
      }
      nitroConfig.routeRules[`${RUNTIME_ASSET_BASE}/onnx/**`] = {
        headers: {
          'content-type': 'application/wasm',
          'cache-control': 'public, max-age=31536000, immutable',
        },
      }
    })
    _nuxt.hook('close', () => {
      rmSync(stagedAssets, { recursive: true, force: true })
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
