export default defineNuxtConfig({
  modules: ['../src/module'],
  devtools: { enabled: true },
  nuxtDocumentScanner: {
    model: {
      name: 'pidinet',
      version: 'tiny',
    },
  },
})
