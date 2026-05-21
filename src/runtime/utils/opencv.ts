import { log, logError } from './logging'

export const loadOpenCV = (opencvUrl: string) =>
  new Promise<boolean>((resolve, reject) => {
    if (!import.meta.client) return resolve(false)

    if ('cv' in globalThis && (globalThis as any).cv?.Mat) {
      log('✅ OpenCV already available globally')
      return resolve(true)
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[data-nuxt-document-scanner-opencv="${opencvUrl}"]`,
    )
    if (existingScript) {
      waitForOpenCV(resolve, reject, opencvUrl)
      return
    }

    const script = document.createElement('script')
    script.src = opencvUrl
    script.async = true
    script.dataset.nuxtDocumentScannerOpencv = opencvUrl

    script.onload = () => {
      log('✅ OpenCV script loaded from URL:', opencvUrl)
    }
    script.onerror = () => {
      document.head.removeChild(script)
      logError('❌ Failed to load OpenCV script from URL:', opencvUrl)
      reject(new Error(`Failed to load OpenCV from URL: ${opencvUrl}`))
    }

    document.head.appendChild(script)
    waitForOpenCV(resolve, reject, opencvUrl)
  })

const waitForOpenCV = (
  resolve: (ready: boolean) => void,
  reject: (error: Error) => void,
  opencvUrl: string,
) => {
  const startedAt = performance.now()
  const checkInterval = setInterval(() => {
    if ('cv' in globalThis && (globalThis as any).cv?.Mat) {
      clearInterval(checkInterval)
      log('✅ OpenCV initialized and ready')
      resolve(true)
      return
    }

    if (performance.now() - startedAt > 15000) {
      clearInterval(checkInterval)
      reject(new Error(`OpenCV initialization timeout: ${opencvUrl}`))
    }
  }, 100)
}
