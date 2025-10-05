export default defineNuxtConfig({
  modules: ['../src/module', '@nuxtjs/tailwindcss'],
  devtools: { enabled: true },
  compatibilityDate: '2025-10-03',
  nuxtDocumentScanner: {
    model: {
      name: 'lcnet100_h_e_bifpn_256_fp32', // DocAligner heatmap model
    },
    inference: {
      prefer: 'webgpu',
      targetResolution: 256, // DocAligner uses 256x256
    },
  },
})
