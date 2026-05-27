import { existsSync, readFileSync } from 'node:fs'

const resolveHttpsValue = (value?: string) => {
  if (!value) return undefined
  return existsSync(value) ? readFileSync(value, 'utf8') : value
}

const httpsCert = resolveHttpsValue(process.env.SSL_CERT)
const httpsKey = resolveHttpsValue(process.env.SSL_KEY)
const scannerHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

export default defineNuxtConfig({
  modules: ['../src/module'],
  devtools: { enabled: false },
  routeRules: {
    '/**': {
      headers: scannerHeaders,
    },
  },
  sourcemap: {
    server: true,
    client: true,
  },
  devServer: {
    https: httpsCert && httpsKey
      ? {
          cert: httpsCert,
          key: httpsKey,
        }
      : undefined,
  },
  compatibilityDate: '2026-05-21',
  vite: {
    server: {
      headers: scannerHeaders,
    },
    preview: {
      headers: scannerHeaders,
    },
    optimizeDeps: {
      include: ['onnxruntime-web/wasm'],
      exclude: ['pdf-lib'],
    },
    resolve: {
      conditions: ['onnxruntime-web-use-extern-wasm'],
    },
  },
  nuxtDocumentScanner: {
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
        delay: 1400,
        cooldown: 4500,
      },
      stableDuration: 1800,
      stableSignificantMotionThreshold: 0.3,
      stableMotionThreshold: 0.3,
      missedRectanglesDuration: 500,
    },
  },
})
