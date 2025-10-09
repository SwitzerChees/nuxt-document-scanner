import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import type { DocumentScannerCornerDetectionOptions } from '../types'
import { loadOpenCV } from '../utils/opencv'
import { drawOverlay, emaQuad, isValidRectangle } from '../utils/overlay'

export const useCornerDetection = (
  opts: DocumentScannerCornerDetectionOptions,
) => {
  const { opencvUrl, worker: workerOptions, overlay, video } = opts
  const isOpenCVReady = ref(false)
  const isWorkerReady = ref(false)
  const worker = shallowRef<Worker>()
  const currentCorners = ref<number[] | undefined>(undefined)

  const isInitialized = computed(
    () => isOpenCVReady.value && isWorkerReady.value,
  )

  const createWorker = () => {
    if (!import.meta.client) return
    worker.value = new Worker(
      new URL('../workers/corner-new.worker.js', import.meta.url),
      {
        type: 'module',
      },
    )
    worker.value!.addEventListener('message', (e) => {
      if (e.data.type === 'ready') {
        isWorkerReady.value = true
      }
    })
    worker.value!.postMessage({ type: 'init', payload: workerOptions })
  }

  onMounted(async () => {
    isOpenCVReady.value = await loadOpenCV(opencvUrl)
    createWorker()
  })
  onUnmounted(() => {
    if (worker.value) {
      worker.value.terminate()
    }
  })

  const inferCorners = async (rgba: ImageData) =>
    new Promise<void>((resolve) => {
      if (!isInitialized.value) return resolve(undefined)
      const onMessage = (e: MessageEvent) => {
        if (e.data.type === 'corners') {
          worker.value!.removeEventListener('message', onMessage)
          validateCorners(e.data.corners)
          resolve()
        }
      }
      worker.value!.addEventListener('message', onMessage)
      worker.value!.postMessage({ type: 'infer', payload: { rgba } }, [
        rgba.data.buffer,
      ])
    })

  const validateCorners = (corners: number[]) => {
    const isRectangle = isValidRectangle(corners)
    if (!isRectangle) {
      return undefined
    }
    const smoothedCorners = emaQuad(currentCorners.value, corners)
    currentCorners.value = smoothedCorners
    if (overlay.value && video.value) {
      drawOverlay({
        canvas: overlay.value,
        video: video.value,
        corners: currentCorners.value,
      })
    }
  }

  return {
    isInitialized,
    inferCorners,
    currentCorners,
  }
}
