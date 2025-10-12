import { computed, ref } from 'vue'
import type { Document, DocumentScannerOptions } from '../types'
import { useStream } from './useStream'
import { useCornerDetection } from './useCornerDetection'
import { useAutoCapture } from './useAutoCapture'
import { copyImageData, postprocessImage } from '../utils/image-postprocessing'

export function useDocumentScanner(opts: DocumentScannerOptions) {
  const captureRequested = ref(false)
  const currentDocument = ref<Document | undefined>(undefined)

  const { videoOptions, overlay, capture: captureOptions } = opts
  const { opencvUrl, worker: workerOptions } = opts
  const { video } = videoOptions

  const stream = useStream(videoOptions)
  const {
    needsRestart,
    restartStream,
    startStream,
    stopStream,
    isStreaming,
    track,
    tracks,
  } = stream
  const { getFrame, streamFrameRate } = stream

  const {
    isInitialized,
    inferCorners,
    isStable,
    initializeWorker,
    currentCorners,
  } = useCornerDetection({
    opencvUrl,
    overlay,
    video,
    worker: workerOptions,
    capture: captureOptions,
  })

  const autoCapture = useAutoCapture(captureOptions.autoCapture)
  const { updateProgress, canAutoCapture, reset, progress, delay } = autoCapture

  const isStarting = ref(false)
  const isStarted = computed(() => isInitialized.value && isStreaming.value)

  const createNewDocument = () => {
    currentDocument.value = {
      id: '1',
      type: 'image',
      format: 'jpg',
      pages: [],
    }
  }

  const startScanner = async () => {
    isStarting.value = true
    await Promise.all([startStream(), initializeWorker()])
    if (!currentDocument.value) createNewDocument()
    isStarting.value = false
    scannerLoop()
  }

  const stopScanner = () => {
    stopStream()
  }

  const performanceMonitor: {
    getFrame: {
      avg: number
      values: number[]
    }
    inferCorners: {
      avg: number
      values: number[]
    }
    postprocessImage: {
      avg: number
      values: number[]
    }
    total: {
      avg: number
      values: number[]
    }
  } = {
    getFrame: {
      avg: 0,
      values: [],
    },
    inferCorners: {
      avg: 0,
      values: [],
    },
    postprocessImage: {
      avg: 0,
      values: [],
    },
    total: {
      avg: 0,
      values: [],
    },
  }

  const scannerLoop = async () => {
    if (!video.value || !overlay.value || !isStarted.value) return

    const frameStart = performance.now()
    const frameDuration = 1000 / streamFrameRate.value

    if (needsRestart.value) {
      needsRestart.value = false
      await restartStream()
    }

    const getFrameStart = performance.now()
    const videoFrame = getFrame()
    if (!videoFrame) return requestAnimationFrame(scannerLoop)
    performanceMonitor.getFrame.values.push(performance.now() - getFrameStart)

    // Yield briefly to let browser render before heavy work
    await new Promise((r) => setTimeout(r, 0))

    const inferCornersStart = performance.now()
    await inferCorners(videoFrame)
    performanceMonitor.inferCorners.values.push(
      performance.now() - inferCornersStart,
    )

    updateProgress(isStable.value)

    if (canAutoCapture()) {
      captureRequested.value = true
      reset(true)
    }

    if (captureRequested.value) {
      captureRequested.value = false
      const finalFrame = getFrame()
      await inferCorners(copyImageData(finalFrame!))
      const postprocessImageStart = performance.now()
      const page = postprocessImage(finalFrame!, currentCorners.value!)
      if (page) currentDocument.value?.pages.push(page)
      performanceMonitor.postprocessImage.values.push(
        performance.now() - postprocessImageStart,
      )
    }
    performanceMonitor.total.values.push(performance.now() - frameStart)
    performanceMonitor.total.avg =
      performanceMonitor.total.values.reduce((a, b) => a + b, 0) /
      performanceMonitor.total.values.length
    performanceMonitor.getFrame.avg =
      performanceMonitor.getFrame.values.reduce((a, b) => a + b, 0) /
      performanceMonitor.getFrame.values.length
    performanceMonitor.inferCorners.avg =
      performanceMonitor.inferCorners.values.reduce((a, b) => a + b, 0) /
      performanceMonitor.inferCorners.values.length
    performanceMonitor.postprocessImage.avg =
      performanceMonitor.postprocessImage.values.reduce((a, b) => a + b, 0) /
      performanceMonitor.postprocessImage.values.length

    // Keep frame timing consistent, avoid blocking next frame
    const elapsed = performance.now() - frameStart
    const delay = Math.max(0, frameDuration - elapsed)

    // log performance monitor every 50 values
    if (performanceMonitor.total.values.length % 50 === 0) {
      console.log('Performance monitor:', performanceMonitor)
    }

    if (performanceMonitor.total.values.length > 50) {
      performanceMonitor.total.values = []
    }
    if (performanceMonitor.getFrame.values.length > 50) {
      performanceMonitor.getFrame.values = []
    }
    if (performanceMonitor.inferCorners.values.length > 50) {
      performanceMonitor.inferCorners.values = []
    }
    if (performanceMonitor.postprocessImage.values.length > 50) {
      performanceMonitor.postprocessImage.values = []
    }

    setTimeout(() => requestAnimationFrame(scannerLoop), delay)
  }

  return {
    track,
    tracks,
    isStarting,
    isStarted,
    startScanner,
    stopScanner,
    createNewDocument,
    isStable,
    currentDocument,
    autoCaptureProgress: progress,
    autoCaptureDelay: delay,
    captureRequested,
  }
}
