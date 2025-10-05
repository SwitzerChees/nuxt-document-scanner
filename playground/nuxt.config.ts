export default defineNuxtConfig({
  modules: ['../src/module', '@nuxtjs/tailwindcss'],
  devtools: { enabled: true },
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
    logging: {
      enabled: true,
    },
    inference: {
      threads: 4, // Enable multi-threading with 4 threads
    },
  },
})
