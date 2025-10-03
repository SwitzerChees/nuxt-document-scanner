export default defineNuxtConfig({
  modules: ['../src/module', '@nuxtjs/tailwindcss'],
  devtools: { enabled: true },
  compatibilityDate: '2025-10-03',
  nuxtDocumentScanner: {
    model: {
      name: 'pidinet',
      version: 'tiny',
    },
  },
})
