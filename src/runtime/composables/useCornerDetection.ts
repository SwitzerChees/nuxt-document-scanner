import { computed, onUnmounted, ref } from 'vue'
import type { DocumentScannerCornerDetectionOptions } from '../types'
import type { CornerHeatmapResult } from '../utils/model-contract'
import {
  calculateQuadMotion,
  emaQuad,
  validateDocumentQuad,
  type FrameSize,
} from '../utils/document-geometry'

type CornerScale = {
  scaleX: number
  scaleY: number
}

type DetectionResult = CornerHeatmapResult & {
  error?: string
}

type PendingInference = {
  requestId: number
  generation: number
  scale?: CornerScale
  timeout: ReturnType<typeof setTimeout>
  resolve: (detection: DetectionResult) => void
}

const emptyDetection = (error?: string): DetectionResult => ({
  confidence: 0,
  points: [],
  error,
})

export const useCornerDetection = (
  opts: DocumentScannerCornerDetectionOptions,
) => {
  const { worker: workerOptions, capture: captureOptions } = opts
  const isWorkerReady = ref(false)
  const currentCorners = ref<number[]>()
  const currentConfidence = ref(0)
  const isStable = ref(false)
  const isInitialized = computed(() => isWorkerReady.value)
  let worker: Worker | undefined
  let workerPromise: Promise<void> | undefined
  let workerGeneration = 0
  let requestSequence = 0
  let supportsTransferableFrames = true
  let pendingInference: PendingInference | undefined
  let resolveInitialization: (() => void) | undefined
  let rejectInitialization: ((error: Error) => void) | undefined
  let initializationTimeout: ReturnType<typeof setTimeout> | undefined
  let resolveDisposal: (() => void) | undefined
  let disposalTimeout: ReturnType<typeof setTimeout> | undefined
  let previousRawCorners: number[] | undefined
  let stableStartTime = 0
  let missedSince = 0
  let motionHistory: Array<{ rms: number; iou: number; confidence: number }> = []

  const {
    stableSignificantMotionThreshold,
    stableDuration,
    missedRectanglesDuration,
    stableMotionThreshold,
    minimumDetectionConfidence,
    minimumDocumentAreaRatio,
    maximumDocumentAspectRatio,
  } = captureOptions

  const scaleDetection = (
    detection: DetectionResult,
    scale?: CornerScale,
  ): DetectionResult => {
    if (!detection.corners || !scale) return detection
    return {
      ...detection,
      corners: detection.corners.map((value, index) =>
        index % 2 === 0 ? value * scale.scaleX : value * scale.scaleY,
      ),
      points: detection.points.map((point) =>
        point
          ? {
              ...point,
              x: point.x * scale.scaleX,
              y: point.y * scale.scaleY,
            }
          : undefined,
      ),
    }
  }

  const resetTracking = (clearCorners = true) => {
    if (clearCorners) currentCorners.value = undefined
    currentConfidence.value = 0
    isStable.value = false
    previousRawCorners = undefined
    stableStartTime = 0
    missedSince = 0
    motionHistory = []
  }

  const clearInitialization = () => {
    if (initializationTimeout) clearTimeout(initializationTimeout)
    initializationTimeout = undefined
    resolveInitialization = undefined
    rejectInitialization = undefined
  }

  const resolvePendingDetection = (detection: DetectionResult) => {
    const pending = pendingInference
    if (!pending) return
    clearTimeout(pending.timeout)
    pendingInference = undefined
    pending.resolve(scaleDetection(detection, pending.scale))
  }

  const terminateWorker = (reason?: string) => {
    if (worker) {
      worker.removeEventListener('message', onWorkerMessage)
      worker.removeEventListener('error', onWorkerError)
      worker.removeEventListener('messageerror', onWorkerMessageError)
      worker.terminate()
    }
    worker = undefined
    workerPromise = undefined
    workerGeneration++
    isWorkerReady.value = false
    supportsTransferableFrames = true
    resolvePendingDetection(emptyDetection(reason))
    if (rejectInitialization) {
      const reject = rejectInitialization
      clearInitialization()
      reject(new Error(reason || 'Corner worker stopped during initialization.'))
    }
  }

  const restartAfterFailure = (generation: number, reason: string) => {
    if (generation !== workerGeneration) return
    terminateWorker(reason)
    void initializeWorker().catch((error) => {
      console.warn('Corner worker could not recover:', error)
    })
  }

  function onWorkerMessage(event: MessageEvent) {
    const message = event.data
    if (message?.generation !== workerGeneration) return
    if (message.type === 'ready') {
      isWorkerReady.value = true
      const resolve = resolveInitialization
      clearInitialization()
      resolve?.()
      return
    }
    if (message.type === 'error' && message.phase === 'initialization') {
      const reject = rejectInitialization
      const error = new Error(message.error || 'Corner worker initialization failed.')
      clearInitialization()
      terminateWorker(error.message)
      reject?.(error)
      return
    }
    if (message.type === 'corners') {
      if (
        !pendingInference ||
        message.requestId !== pendingInference.requestId ||
        message.generation !== pendingInference.generation
      ) {
        return
      }
      if (message.error) console.warn('Corner inference failed:', message.error)
      resolvePendingDetection({
        ...(message.detection || emptyDetection()),
        error: message.error,
      })
      return
    }
    if (message.type === 'disposed') resolveDisposal?.()
  }

  function onWorkerError(event: ErrorEvent) {
    const message = event.message || 'Corner worker runtime error.'
    const generation = workerGeneration
    if (rejectInitialization) {
      const reject = rejectInitialization
      clearInitialization()
      terminateWorker(message)
      reject(new Error(message))
      return
    }
    restartAfterFailure(generation, message)
  }

  function onWorkerMessageError() {
    const generation = workerGeneration
    restartAfterFailure(generation, 'Corner worker message could not be cloned.')
  }

  const initializeWorker = () => {
    if (isWorkerReady.value) return Promise.resolve()
    if (workerPromise) return workerPromise
    if (!import.meta.client) return Promise.resolve()

    const generation = ++workerGeneration
    workerPromise = new Promise<void>((resolve, reject) => {
      resolveInitialization = resolve
      rejectInitialization = reject
      worker = new Worker(
        new URL('../workers/corner.worker.js', import.meta.url),
        { type: 'module' },
      )
      worker.addEventListener('message', onWorkerMessage)
      worker.addEventListener('error', onWorkerError)
      worker.addEventListener('messageerror', onWorkerMessageError)
      worker.postMessage({
        type: 'init',
        generation,
        payload: workerOptions,
      })
      initializationTimeout = setTimeout(() => {
        if (generation !== workerGeneration) return
        const timeoutError = new Error(
          'Corner worker initialization timed out while loading the model.',
        )
        const rejectPending = rejectInitialization
        clearInitialization()
        terminateWorker(timeoutError.message)
        rejectPending?.(timeoutError)
      }, 60_000)
    })
    return workerPromise
  }

  const initializeDetection = async () => initializeWorker()

  const disposeWorker = async () => {
    resetTracking()
    const currentWorker = worker
    const generation = workerGeneration
    if (!currentWorker) {
      terminateWorker()
      return
    }

    await new Promise<void>((resolve) => {
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        if (disposalTimeout) clearTimeout(disposalTimeout)
        disposalTimeout = undefined
        resolveDisposal = undefined
        resolve()
      }
      resolveDisposal = finish
      disposalTimeout = setTimeout(finish, 750)
      try {
        currentWorker.postMessage({ type: 'dispose', generation })
      } catch {
        finish()
      }
    })
    if (generation === workerGeneration) terminateWorker()
  }

  const detectCorners = async (
    videoFrame: ImageData,
    scale?: CornerScale,
  ): Promise<DetectionResult> => {
    if (!isInitialized.value || !worker) return emptyDetection('Detector is not ready.')
    if (pendingInference) return emptyDetection('Inference backpressure dropped a frame.')

    const requestId = ++requestSequence
    const generation = workerGeneration
    return new Promise<DetectionResult>((resolve) => {
      const timeout = setTimeout(() => {
        if (
          !pendingInference ||
          pendingInference.requestId !== requestId ||
          pendingInference.generation !== generation
        ) {
          return
        }
        resolvePendingDetection(emptyDetection('Corner inference timed out.'))
        restartAfterFailure(generation, 'Corner inference timed out.')
      }, 5_000)
      pendingInference = { requestId, generation, scale, timeout, resolve }
      const message = {
        type: 'infer',
        requestId,
        generation,
        payload: { videoFrame },
      }
      try {
        if (supportsTransferableFrames) {
          worker!.postMessage(message, [videoFrame.data.buffer])
        } else {
          worker!.postMessage(message)
        }
      } catch (error) {
        if (supportsTransferableFrames) {
          supportsTransferableFrames = false
          try {
            worker!.postMessage(message)
            return
          } catch (fallbackError) {
            resolvePendingDetection(
              emptyDetection(
                fallbackError instanceof Error
                  ? fallbackError.message
                  : 'Could not send frame to worker.',
              ),
            )
            return
          }
        }
        resolvePendingDetection(
          emptyDetection(
            error instanceof Error ? error.message : 'Could not send frame to worker.',
          ),
        )
      }
    })
  }

  const registerInvalidDetection = (now: number) => {
    isStable.value = false
    stableStartTime = 0
    motionHistory = []
    previousRawCorners = undefined
    currentConfidence.value = 0
    if (!missedSince) missedSince = now
    if (now - missedSince >= missedRectanglesDuration) {
      currentCorners.value = undefined
      missedSince = 0
    }
  }

  const registerValidDetection = (
    corners: number[],
    confidence: number,
    frameSize: FrameSize,
    now: number,
  ) => {
    missedSince = 0
    currentConfidence.value = confidence
    const previous = previousRawCorners
    previousRawCorners = corners.slice()
    currentCorners.value = emaQuad(currentCorners.value, corners)

    if (!previous) {
      stableStartTime = 0
      motionHistory = []
      isStable.value = false
      return
    }

    const motion = calculateQuadMotion(previous, corners, frameSize)
    const significant =
      motion.rms > stableSignificantMotionThreshold ||
      motion.max > stableSignificantMotionThreshold * 1.5 ||
      motion.iou < 0.55
    if (significant) {
      stableStartTime = 0
      motionHistory = []
      isStable.value = false
      return
    }

    motionHistory.push({ rms: motion.rms, iou: motion.iou, confidence })
    if (motionHistory.length > 8) motionHistory.shift()
    if (motionHistory.length < 4) return

    const averageRms =
      motionHistory.reduce((sum, entry) => sum + entry.rms, 0) /
      motionHistory.length
    const minimumIou = Math.min(...motionHistory.map((entry) => entry.iou))
    const minimumConfidence = Math.min(
      ...motionHistory.map((entry) => entry.confidence),
    )
    const withinThreshold =
      averageRms <= stableMotionThreshold &&
      minimumIou >= Math.max(0.8, 1 - stableMotionThreshold * 5) &&
      minimumConfidence >= minimumDetectionConfidence

    if (!withinThreshold) {
      stableStartTime = 0
      isStable.value = false
      return
    }
    if (!stableStartTime) stableStartTime = now
    isStable.value = now - stableStartTime >= stableDuration
  }

  const inferCorners = async (videoFrame: ImageData, scale?: CornerScale) => {
    const detection = await detectCorners(videoFrame, scale)
    const frameSize = {
      width: videoFrame.width * (scale?.scaleX || 1),
      height: videoFrame.height * (scale?.scaleY || 1),
    }
    const valid = validateDocumentQuad(detection.corners, {
      frameSize,
      minAreaRatio: minimumDocumentAreaRatio,
      maxAspectRatio: maximumDocumentAspectRatio,
    }).valid
    const confident = detection.confidence >= minimumDetectionConfidence
    const now = performance.now()
    if (!detection.corners || !valid || !confident) {
      registerInvalidDetection(now)
      return detection
    }
    registerValidDetection(detection.corners, detection.confidence, frameSize, now)
    return detection
  }

  onUnmounted(() => {
    void disposeWorker()
  })

  return {
    isInitialized,
    currentCorners,
    currentConfidence,
    isStable,
    detectCorners,
    inferCorners,
    initializeDetection,
    initializeWorker,
    disposeWorker,
    resetTracking,
  }
}
