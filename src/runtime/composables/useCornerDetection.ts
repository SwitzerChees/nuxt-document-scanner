import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import type { DocumentScannerCornerDetectionOptions } from '../types'
import { loadOpenCV } from '../utils/opencv'

export const useCornerDetection = (
  opts: DocumentScannerCornerDetectionOptions,
) => {
  const { overlay, opencvUrl } = opts
  const isOpenCVReady = ref(false)
  const isWorkerReady = ref(false)
  const worker = shallowRef<Worker>()

  const isInitialized = computed(
    () => isOpenCVReady.value && isWorkerReady.value,
  )

  const createWorker = async () => {
    if (!import.meta.client) return
    worker.value = new Worker(
      new URL('../workers/corner.worker.js', import.meta.url),
      {
        type: 'module',
      },
    )
  }

  onMounted(async () => {
    isOpenCVReady.value = await loadOpenCV(opencvUrl)
    await createWorker()
    isWorkerReady.value = true
  })
  onUnmounted(() => {
    if (worker.value) {
      worker.value.terminate()
    }
  })

  return {
    isInitialized,
  }
}
