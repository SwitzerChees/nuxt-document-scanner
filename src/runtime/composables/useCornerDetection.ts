import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import type { DocumentScannerCornerDetectionOptions } from '../types'
import { loadOpenCV } from '../utils/opencv'
import {
  calculateQuadArea,
  calculateSignificantChange,
  drawOverlay,
  emaQuad,
  isValidRectangle,
} from '../utils/overlay'

export const useCornerDetection = (
  opts: DocumentScannerCornerDetectionOptions,
) => {
  const {
    opencvUrl,
    worker: workerOptions,
    overlay,
    video,
    capture: captureOptions,
  } = opts
  const isOpenCVReady = ref(false)
  const isWorkerReady = ref(false)
  const worker = shallowRef<Worker>()
  const currentCorners = ref<number[] | undefined>(undefined)
  const { maxMissedRectangles } = captureOptions
  const {
    stableSignificantMotionThreshold,
    stableDuration,
    stableMotionThreshold,
  } = captureOptions
  const isStable = ref(false)
  const lastQuadArea = ref(0)
  const quadAreaHistory = ref<number[]>([])

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
          const isValid = validateCorners(e.data.corners)
          if (isValid) {
            validateStability()
          } else {
            isStable.value = false
            quadAreaHistory.value = []
          }
          if (overlay.value && video.value) {
            drawOverlay({
              canvas: overlay.value,
              video: video.value,
              corners: currentCorners.value,
            })
          }
          resolve()
        }
      }
      worker.value!.addEventListener('message', onMessage)
      worker.value!.postMessage({ type: 'infer', payload: { rgba } }, [
        rgba.data.buffer,
      ])
    })

  const currentMissedRectangles = ref(0)
  const validateCorners = (corners: number[]) => {
    const isRectangle = isValidRectangle(corners)

    if (!isRectangle) {
      currentMissedRectangles.value++
      if (currentMissedRectangles.value >= maxMissedRectangles) {
        currentCorners.value = undefined
        lastQuadArea.value = 0
        currentMissedRectangles.value = 0
      }
      return false
    }

    const area = calculateQuadArea(corners)
    if (lastQuadArea.value == 0) {
      lastQuadArea.value = area
    }
    const significantChange = calculateSignificantChange(
      lastQuadArea.value,
      area,
      stableSignificantMotionThreshold,
    )

    if (significantChange) {
      currentMissedRectangles.value = 0
      currentCorners.value = undefined
      lastQuadArea.value = 0
      return false
    }

    const smoothedCorners = emaQuad(currentCorners.value, corners)
    currentCorners.value = smoothedCorners
    lastQuadArea.value = area
    quadAreaHistory.value.push(area)
    return true
  }

  const stableStartTime = ref(0)
  const validateStability = () => {
    if (quadAreaHistory.value.length < 5) return

    const mean =
      quadAreaHistory.value.reduce((a, b) => a + b, 0) /
      quadAreaHistory.value.length
    if (mean <= 0) return

    const variance =
      quadAreaHistory.value.reduce((a, b) => a + (b - mean) ** 2, 0) /
      quadAreaHistory.value.length

    const stdDev = Math.sqrt(variance)
    const normalizedDelta = stdDev / mean // 0..1 relative variation
    const withinThreshold = normalizedDelta < stableMotionThreshold

    const now = performance.now()

    if (withinThreshold) {
      if (!stableStartTime.value) stableStartTime.value = now
      if (now - stableStartTime.value >= stableDuration) isStable.value = true
    } else {
      stableStartTime.value = 0
      isStable.value = false
    }

    console.log('isStable', isStable.value)

    if (quadAreaHistory.value.length > 10) quadAreaHistory.value.shift()
  }

  return {
    isInitialized,
    inferCorners,
    currentCorners,
    isStable,
  }
}
