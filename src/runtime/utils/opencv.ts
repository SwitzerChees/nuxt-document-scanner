import { log, logError } from './logging'

export const loadOpenCV = (opencvUrl: string) =>
  new Promise<boolean>((resolve, reject) => {
    if (!import.meta.client) return

    if ('cv' in globalThis && (globalThis as any).cv?.Mat) {
      log('✅ OpenCV already available globally')
      return resolve(true)
    }

    const script = document.createElement('script')
    script.src = opencvUrl
    script.async = true

    script.onload = () => {
      log('✅ OpenCV script loaded from URL:', opencvUrl)
    }
    script.onerror = () => {
      document.head.removeChild(script)
      logError('❌ Failed to load OpenCV script from URL:', opencvUrl)
      reject(new Error(`Failed to load OpenCV from URL: ${opencvUrl}`))
    }
    const checkInterval = setInterval(() => {
      if ('cv' in globalThis && (globalThis as any).cv?.Mat) {
        clearInterval(checkInterval)
        log('✅ OpenCV WASM initialized and ready')
        resolve(true)
      }
    }, 100)

    document.head.appendChild(script)
  })
