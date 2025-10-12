export default defineNuxtConfig({
  modules: ['../src/module', '@nuxtjs/tailwindcss'],
  devtools: { enabled: true },
  sourcemap: {
    server: true,
    client: true,
  },
  compatibilityDate: '2025-10-03',
  nitro: {
    routeRules: {
      '/onnx/**': {
        headers: {
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Resource-Policy': 'same-origin',
        },
      },
    },
  },
  nuxtDocumentScanner: {
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
})
