import { computed, ref } from 'vue'
import type { Document, DocumentScannerOptions } from '../types'
import { useStream } from './useStream'
import { useCornerDetection } from './useCornerDetection'
import { useAutoCapture } from './useAutoCapture'
import { copyImageData, postprocessImage } from '../utils/image-postprocessing'
import { drawOverlay } from '../utils/overlay'

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
    drawingLoop()
  }

  const stopScanner = () => {
    stopStream()
  }

  const drawingLoop = async () => {
    if (!video.value || !overlay.value || !isStarted.value) return
    drawOverlay({
      canvas: overlay.value,
      video: video.value,
      corners: currentCorners.value,
    })
    if (isStarted.value) {
      requestAnimationFrame(drawingLoop)
    }
  }

  const scannerLoop = async () => {
    if (!video.value || !overlay.value || !isStarted.value) return

    const frameStart = performance.now()
    const frameDuration = 1000 / streamFrameRate.value

    if (needsRestart.value) {
      needsRestart.value = false
      await restartStream()
    }

    const videoFrame = getFrame()
    if (!videoFrame) return requestAnimationFrame(scannerLoop)

    // Yield briefly to let browser render before heavy work
    await new Promise((r) => setTimeout(r, 0))

    await inferCorners(videoFrame)

    updateProgress(isStable.value)

    if (canAutoCapture()) {
      captureRequested.value = true
      reset(true)
    }

    if (captureRequested.value) {
      captureRequested.value = false
      const finalFrame = getFrame()
      await inferCorners(copyImageData(finalFrame!))
      const page = postprocessImage(finalFrame!, currentCorners.value!)
      if (page) currentDocument.value?.pages.push(page)
    }

    // Keep frame timing consistent, avoid blocking next frame
    const elapsed = performance.now() - frameStart
    const delay = Math.max(0, frameDuration - elapsed)
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
