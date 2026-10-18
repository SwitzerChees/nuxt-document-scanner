import { computed, onUnmounted, ref } from 'vue'
import type { DocumentScannerCornerDetectionOptions } from '../types'
import { WorkerRPC } from '../core/rpc'
import { DEFAULT_TRACKER_OPTIONS, DocumentTracker } from '../engine/tracker'
import type { TrackerHint } from '../engine/tracker'
import type { Quad } from '../engine/geometry'
import { validateDocumentQuad } from '../utils/document-geometry'

export type DetectionResult = {
  corners?: number[];
  confidence: number;
  width: number;
  height: number;
  sharpness: number;
  brightness: number;
  error?: string;
}
const toQuad = (corners: number[]) => [0, 2, 4, 6].map(i => ({ x: corners[i]!, y: corners[i + 1]! })) as Quad
export const useCornerDetection = (opts: DocumentScannerCornerDetectionOptions) => {
  const isInitialized = ref(false), currentCorners = ref<number[]>(), currentConfidence = ref(0), isStable = ref(false)
  const progress = ref(0), shouldCapture = ref(false), hint = ref<TrackerHint>()
  const options = opts.capture
  const tracker = new DocumentTracker({ width: 1, height: 1 }, {
    ...DEFAULT_TRACKER_OPTIONS,
    minConfidence: options.minimumDetectionConfidence,
    minAreaRatio: options.minimumDocumentAreaRatio,
    maxSideRatio: options.maximumDocumentAspectRatio,
    lostAfterMs: options.missedRectanglesDuration,
    steadyThreshold: options.stableMotionThreshold,
    jumpThreshold: options.stableSignificantMotionThreshold,
    captureAfterMs: options.stableDuration + options.autoCapture.delay,
    autoCapture: options.autoCapture.enabled,
  })
  let rpc: WorkerRPC | undefined, ready: Promise<void> | undefined, active: Promise<DetectionResult> | undefined
  const initializeDetection = () => {
    if (ready)
      return ready
    const current = rpc = new WorkerRPC(new Worker(new URL('../workers/corner.worker.js', import.meta.url), { type: 'module' }))
    ready = current.request('init', {
      ...opts.worker,
      modelPath: new URL(opts.worker.modelPath, location.href).href,
      onnxPath: new URL(opts.worker.onnxPath, location.href).href,
    }, [], 60000).then(() => { if (rpc === current)
      isInitialized.value = true }).catch(error => {
      current.close()
      if (rpc === current) {
        rpc = undefined
        ready = undefined
        isInitialized.value = false
      }
      throw error
    })
    return ready
  }
  const resetTracking = () => {
    tracker.reset()
    currentCorners.value = undefined
    currentConfidence.value = 0
    isStable.value = false
    progress.value = 0
    shouldCapture.value = false
    hint.value = undefined
  }
  const disposeWorker = async () => {
    rpc?.close()
    rpc = undefined
    ready = undefined
    isInitialized.value = false
    resetTracking()
  }
  const detectCorners = (bitmap: ImageBitmap, scale = { scaleX: 1, scaleY: 1 }): Promise<DetectionResult> => {
    const width = bitmap.width, height = bitmap.height
    if (!rpc || !isInitialized.value || active) {
      bitmap.close()
      return Promise.resolve({ confidence: 0, width, height, sharpness: 0, brightness: 0 })
    }
    const current = rpc
    active = current.request<DetectionResult>('infer', { videoFrame: bitmap }, [bitmap], 6000).then(result => ({
      ...result,
      corners: result.corners?.map((v, i) => v * (i % 2 ? height / result.height * scale.scaleY : width / result.width * scale.scaleX)),
      width: width * scale.scaleX, height: height * scale.scaleY,
    })).then(result => ({
      ...result,
      corners: result.confidence >= options.minimumDetectionConfidence && validateDocumentQuad(result.corners, {
        frameSize: result, minAreaRatio: options.minimumDocumentAreaRatio, maxAspectRatio: options.maximumDocumentAspectRatio,
      }).valid
        ? result.corners
        : undefined,
    })).catch(error => {
      if (rpc === current) {
        current.close()
        rpc = undefined
        ready = undefined
        isInitialized.value = false
        resetTracking()
      }
      throw error
    }).finally(() => { active = undefined })
    return active
  }
  const inferCorners = async (bitmap: ImageBitmap, scale?: {
    scaleX: number;
    scaleY: number;
  }) => {
    const result = await detectCorners(bitmap, scale)
    const frame = { width: result.width, height: result.height }
    const valid = validateDocumentQuad(result.corners, {
      frameSize: frame, minAreaRatio: options.minimumDocumentAreaRatio, maxAspectRatio: options.maximumDocumentAspectRatio,
    }).valid
    tracker.setFrame(frame)
    const tracked = tracker.update(valid && result.corners ? { quad: toQuad(result.corners), confidence: result.confidence, sharpness: result.sharpness } : undefined, performance.now())
    currentCorners.value = tracked.quad?.flatMap(p => [p.x, p.y])
    currentConfidence.value = valid ? result.confidence : 0
    isStable.value = tracked.status === 'steady'
    const lit = result.brightness >= 40 && result.brightness <= 248
    progress.value = lit ? tracked.progress : 0
    shouldCapture.value = tracked.shouldCapture && lit
    hint.value = tracked.hint
    return result
  }
  const markCaptured = () => {
    tracker.markCaptured(currentCorners.value ? toQuad(currentCorners.value) : undefined)
    progress.value = 0
    shouldCapture.value = false
  }
  const setAutoCapture = (on: boolean) => {
    tracker.setAutoCapture(on)
    progress.value = 0
    shouldCapture.value = false
  }
  onUnmounted(() => {
    void disposeWorker()
  })
  return {
    isInitialized: computed(() => isInitialized.value), currentCorners, currentConfidence, isStable,
    detectCorners, inferCorners, initializeDetection, initializeWorker: initializeDetection, disposeWorker, resetTracking,
    waitForInferenceIdle: () => active?.then(() => { }, () => { }) ?? Promise.resolve(),
    progress, shouldCapture, hint, markCaptured, setAutoCapture,
  }
}
