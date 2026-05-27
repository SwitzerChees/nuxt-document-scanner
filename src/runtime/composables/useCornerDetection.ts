import { computed, onUnmounted, ref } from 'vue'
import type { DocumentScannerCornerDetectionOptions } from '../types'
import {
  calculateQuadArea,
  calculateSignificantChange,
  emaQuad,
  isValidRectangle,
} from '../utils/overlay'

type CornerScale = {
  scaleX: number
  scaleY: number
}

export const useCornerDetection = (
  opts: DocumentScannerCornerDetectionOptions,
) => {
  const { worker: workerOptions, capture: captureOptions } = opts
  const isWorkerReady = ref(false)
  let worker: Worker | undefined
  let workerPromise: Promise<void> | undefined
  let supportsTransferableFrames = true
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
  const stableStartTime = ref(0)
  const missedRectanglesStartTime = ref(0)

  const isInitialized = computed(() => isWorkerReady.value)

  const scaleCorners = (corners: number[] | undefined, scale?: CornerScale) => {
    if (!corners || corners.length !== 8 || !scale) return corners
    return corners.map((value, index) =>
      index % 2 === 0 ? value * scale.scaleX : value * scale.scaleY,
    )
  }

  const resetCornerState = () => {
    currentCorners.value = undefined
    isStable.value = false
    lastQuadArea.value = 0
    quadAreaHistory.value = []
    stableStartTime.value = 0
    missedRectanglesStartTime.value = 0
  }

  const formatWorkerError = (error: unknown, fallback: string) => {
    if (error instanceof Error) return error.message
    if (error instanceof ErrorEvent && error.message) return error.message
    if (error instanceof MessageEvent) return 'Worker message could not be cloned.'
    if (error instanceof Event) return fallback
    return String(error || fallback)
  }

  const disposeWorker = async () => {
    const currentWorker = worker
    worker = undefined
    workerPromise = undefined
    isWorkerReady.value = false
    supportsTransferableFrames = true
    resetCornerState()

    if (!currentWorker) return

    await new Promise<void>((resolve) => {
      let isCleanedUp = false
      const cleanup = () => {
        if (isCleanedUp) return
        isCleanedUp = true
        clearTimeout(timeout)
        currentWorker.removeEventListener('message', onMessage)
        currentWorker.removeEventListener('error', onError)
        currentWorker.removeEventListener('messageerror', onError)
        currentWorker.terminate()
        resolve()
      }
      const timeout = setTimeout(cleanup, 750)
      const onMessage = (event: MessageEvent) => {
        if (event.data?.type === 'disposed') cleanup()
      }
      const onError = () => cleanup()
      currentWorker.addEventListener('message', onMessage)
      currentWorker.addEventListener('error', onError)
      currentWorker.addEventListener('messageerror', onError)
      try {
        currentWorker.postMessage({ type: 'dispose' })
      } catch {
        cleanup()
      }
    })
  }

  const initializeWorker = () => {
    if (isWorkerReady.value) return Promise.resolve()
    if (workerPromise) return workerPromise

    workerPromise = new Promise<void>((resolve, reject) => {
      if (!import.meta.client) return resolve()
      let timeout: ReturnType<typeof setTimeout> | null = null
      if (worker) {
        return resolve()
      }

      const cleanup = () => {
        if (timeout) clearTimeout(timeout)
        worker?.removeEventListener('message', onMessage)
        worker?.removeEventListener('error', onError)
        worker?.removeEventListener('messageerror', onMessageError)
      }

      const fail = (error: unknown, fallback: string) => {
        cleanup()
        worker?.terminate()
        worker = undefined
        workerPromise = undefined
        isWorkerReady.value = false
        reject(new Error(formatWorkerError(error, fallback)))
      }

      const onError = (event: Event) => {
        fail(event, 'Worker failed while loading ONNX Runtime.')
      }

      const onMessageError = (event: MessageEvent) => {
        fail(event, 'Worker message failed while initializing.')
      }

      const onMessage = (e: MessageEvent) => {
        const type = e.data?.type
        if (type === 'ready') {
          cleanup()
          isWorkerReady.value = true
          resolve()
          return
        }

        if (type === 'error') {
          fail(
            new Error(e.data?.error || 'Worker initialization failed'),
            'Worker initialization failed',
          )
        }
      }

      worker = new Worker(
        new URL('../workers/corner.worker.js', import.meta.url),
        {
          type: 'module',
        },
      )

      worker.addEventListener('message', onMessage)
      worker.addEventListener('error', onError)
      worker.addEventListener('messageerror', onMessageError)
      worker.postMessage({ type: 'init', payload: workerOptions })
      timeout = setTimeout(() => {
        fail(
          new Error(
            'Worker initialization timeout. ONNX Runtime or the model did not finish loading.',
          ),
          'Worker initialization timeout',
        )
      }, 60000)
    })
    return workerPromise
  }

  const initializeDetection = async () => {
    await initializeWorker()
  }

  onUnmounted(() => {
    void disposeWorker()
  })

  const detectCorners = async (videoFrame: ImageData, scale?: CornerScale) =>
    new Promise<number[] | undefined>((resolve) => {
      if (!isInitialized.value) return resolve(undefined)

      let timeout: ReturnType<typeof setTimeout> | null = null

      const cleanup = () => {
        if (timeout) clearTimeout(timeout)
        worker?.removeEventListener('message', onMessage)
        worker?.removeEventListener('error', onError)
        worker?.removeEventListener('messageerror', onMessageError)
      }

      const onMessage = (e: MessageEvent) => {
        if (e.data.type === 'error') {
          console.warn('Worker inference failed:', e.data?.error)
          cleanup()
          resolve(undefined)
          return
        }

        if (e.data.type === 'corners') {
          cleanup()
          if (e.data?.error) {
            console.warn('Worker returned inference error:', e.data.error)
          }
          const corners = scaleCorners(e.data.corners, scale)
          resolve(corners)
        }
      }

      const onError = (e: Event) => {
        console.warn('Worker runtime error during inference:', e)
        cleanup()
        resolve(undefined)
      }

      const onMessageError = (e: Event) => {
        console.warn('Worker message error during inference:', e)
        cleanup()
        resolve(undefined)
      }

      worker?.addEventListener('message', onMessage)
      worker?.addEventListener('error', onError)
      worker?.addEventListener('messageerror', onMessageError)

      timeout = setTimeout(() => {
        console.warn('Worker inference timeout')
        cleanup()
        resolve(undefined)
      }, 5000)

      const payload = { type: 'infer', payload: { videoFrame } }
      try {
        if (supportsTransferableFrames) {
          worker?.postMessage(payload, [videoFrame.data.buffer])
        } else {
          worker?.postMessage(payload)
        }
      } catch (error) {
        if (supportsTransferableFrames) {
          supportsTransferableFrames = false
          console.warn(
            'Transferable frame postMessage failed, retrying without transfer.',
          )
          try {
            worker?.postMessage(payload)
            return
          } catch (fallbackError) {
            console.error(
              'Worker postMessage failed without transferable frame:',
              fallbackError,
            )
          }
        } else {
          console.error('Worker postMessage failed:', error)
        }
        cleanup()
        resolve(undefined)
      }
    })

  const inferCorners = async (videoFrame: ImageData, scale?: CornerScale) => {
    const corners = await detectCorners(videoFrame, scale)
    const isValid = validateCorners(corners)
    if (isValid) {
      validateStability()
    } else {
      isStable.value = false
      quadAreaHistory.value = []
    }
  }

  const validateCorners = (corners?: number[]) => {
    if (!corners) return false
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
    detectCorners,
    inferCorners,
    initializeDetection,
    initializeWorker,
    disposeWorker,
  }
}
