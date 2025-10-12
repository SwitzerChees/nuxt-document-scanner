import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { DocumentScannerCornerDetectionOptions } from '../types'
import { loadOpenCV } from '../utils/opencv'
import {
  calculateQuadArea,
  calculateSignificantChange,
  emaQuad,
  isValidRectangle,
} from '../utils/overlay'

export const useCornerDetection = (
  opts: DocumentScannerCornerDetectionOptions,
) => {
  const { opencvUrl, worker: workerOptions, capture: captureOptions } = opts
  const isOpenCVReady = ref(false)
  const isWorkerReady = ref(false)
  let worker: Worker | undefined
  const currentCorners = ref<number[] | undefined>(undefined)
  const {
    stableSignificantMotionThreshold,
    stableDuration,
    missedRectanglesDuration,
    stableMotionThreshold,
  } = captureOptions
  const isStable = ref(false)
  const lastQuadArea = ref(0)
  const quadAreaHistory = ref<number[]>([])

  const isInitialized = computed(
    () => isOpenCVReady.value && isWorkerReady.value,
  )

  const initializeWorker = () =>
    new Promise<void>((resolve, reject) => {
      if (!import.meta.client) return
      let timeout: NodeJS.Timeout | null = null
      if (worker) {
        console.log('Worker already created!')
        return resolve()
      }
      worker = new Worker(
        new URL('../workers/corner.worker.js', import.meta.url),
        {
          type: 'module',
        },
      )
      worker.onmessageerror = (e) => {
        reject(e)
      }
      worker.onerror = (e) => {
        reject(e)
      }
      const onMessage = (e: MessageEvent) => {
        console.log('Worker message:', e.data.type)
        isWorkerReady.value = true
        resolve()
        clearTimeout(timeout!)
        worker!.removeEventListener('message', onMessage)
        console.log('Worker initialized')
      }
      worker.addEventListener('message', onMessage)
      console.log('Initializing worker...')
      worker.postMessage({ type: 'init', payload: workerOptions })
      timeout = setTimeout(() => {
        console.log('Worker initialization timeout...')
        reject(new Error('Worker initialization timeout'))
      }, 10000)
    })

  onMounted(async () => {
    isOpenCVReady.value = await loadOpenCV(opencvUrl)
  })
  onUnmounted(() => {
    if (worker) {
      worker.terminate()
      worker = undefined
    }
  })

  const inferCorners = async (videoFrame: ImageData) =>
    new Promise<void>((resolve) => {
      if (!isInitialized.value) return resolve(undefined)
      const onMessage = (e: MessageEvent) => {
        if (e.data.type === 'corners') {
          worker!.removeEventListener('message', onMessage)
          const isValid = validateCorners(e.data.corners)
          if (isValid) {
            validateStability()
          } else {
            isStable.value = false
            quadAreaHistory.value = []
          }
          resolve()
        }
      }
      worker!.addEventListener('message', onMessage)
      worker!.postMessage({ type: 'infer', payload: { rgba: videoFrame } }, [
        videoFrame.data.buffer,
      ])
    })

  const validateCorners = (corners: number[]) => {
    const isRectangle = isValidRectangle(corners)

    if (!isRectangle) {
      if (!missedRectanglesStartTime.value)
        missedRectanglesStartTime.value = performance.now()
      if (
        performance.now() - missedRectanglesStartTime.value >=
        missedRectanglesDuration
      ) {
        currentCorners.value = undefined
        lastQuadArea.value = 0
        missedRectanglesStartTime.value = 0
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
      missedRectanglesStartTime.value = 0
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
  const missedRectanglesStartTime = ref(0)
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

    if (quadAreaHistory.value.length > 10) quadAreaHistory.value.shift()
  }

  return {
    isInitialized,
    currentCorners,
    isStable,
    inferCorners,
    initializeWorker,
  }
}
