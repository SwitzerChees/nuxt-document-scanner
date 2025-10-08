import { onUnmounted, ref, shallowRef } from 'vue'
import type { DocumentScannerCornerDetectionOptions } from '../types'
import { log, logError } from '../utils/logging'

export const useCornerDetection = (
  opts: DocumentScannerCornerDetectionOptions,
) => {
  const { overlay, opencvUrl } = opts
  const isOpenCVReady = ref(false)
  const isWorkerReady = ref(false)

  const loadOpenCV = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = opencvUrl
    script.async = true

    script.onload = () => {
      log('✅ OpenCV script loaded from URL:', opencvUrl)
    }
    script.onerror = () => {
      isOpenCVReady.value = false
      document.head.removeChild(script)
      logError('❌ Failed to load OpenCV script from URL:', opencvUrl)
      reject(new Error(`Failed to load OpenCV from URL: ${opencvUrl}`))
    }
    const checkInterval = setInterval(() => {
      if ('cv' in globalThis && (globalThis as any).cv?.Mat) {
        clearInterval(checkInterval)
        isOpenCVReady.value = true
        log('✅ OpenCV WASM initialized and ready')
        resolve()
      }
    }, 100)

    document.head.appendChild(script)
  })

  const createWorker = async () => {
    const worker = new Worker(
      new URL('../workers/corner.worker.js', import.meta.url),
      {
        type: 'module',
      },
    )
    return worker
  }

  const worker = shallowRef<Worker>()

  onUnmounted(() => {
    if (worker.value) {
      worker.value.terminate()
    }
  })

  return {
    isOpenCVReady,
    isWorkerReady,
    loadOpenCV,
    createWorker,
  }
}
