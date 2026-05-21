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
  const error = ref<string>()

  const { videoOptions, overlay, capture: captureOptions } = opts
  const { opencvUrl, worker: workerOptions } = opts
  const { video } = videoOptions

  const stream = useStream(videoOptions)
  const {
    needsRestart,
    restartStream,
    selectTrack,
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
    initializeDetection,
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
  let loopActive = false
  let scannerTimer: ReturnType<typeof setTimeout> | undefined
  let scannerFrame = 0
  let overlayFrame = 0

  const createNewDocument = () => {
    const now = Date.now()
    currentDocument.value = {
      id: `document-${now}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'image',
      format: 'jpg',
      createdAt: now,
      updatedAt: now,
      pages: [],
    }
  }

  const getErrorMessage = (value: unknown) => {
    if (value instanceof Error) return value.message
    if (value instanceof ErrorEvent && value.message) return value.message
    if (value instanceof Event) return 'Scanner could not start. Check camera and model access.'
    return String(value || 'Scanner could not start.')
  }

  const startScanner = async () => {
    if (isStarting.value || isStarted.value) return
    isStarting.value = true
    error.value = undefined

    try {
      await Promise.all([startStream(), initializeDetection()])
      if (!currentDocument.value) createNewDocument()
      loopActive = true
      scannerLoop()
      animationLoop()
    } catch (e) {
      error.value = getErrorMessage(e)
      stopScanner()
    } finally {
      isStarting.value = false
    }
  }

  const stopScanner = () => {
    loopActive = false
    if (scannerTimer) clearTimeout(scannerTimer)
    if (scannerFrame) cancelAnimationFrame(scannerFrame)
    if (overlayFrame) cancelAnimationFrame(overlayFrame)
    scannerTimer = undefined
    scannerFrame = 0
    overlayFrame = 0
    stopStream()
  }

  const animationLoop = async () => {
    if (!loopActive || !video.value || !overlay.value || !isStarted.value) return
    drawOverlay({
      canvas: overlay.value,
      video: video.value,
      corners: currentCorners.value,
    })
    if (canAutoCapture()) {
      captureRequested.value = true
      reset(true)
    }
    updateProgress(isStable.value)
    if (loopActive && isStarted.value) {
      overlayFrame = requestAnimationFrame(animationLoop)
    }
  }

  const scannerLoop = async () => {
    if (!loopActive || !video.value || !overlay.value || !isStarted.value) {
      return
    }

    const frameStart = performance.now()
    const frameDuration = 1000 / Math.max(streamFrameRate.value || 30, 1)

    if (needsRestart.value) {
      needsRestart.value = false
      await restartStream()
    }

    const videoFrame = getFrame()
    if (!videoFrame) {
      scannerFrame = requestAnimationFrame(scannerLoop)
      return
    }

    // Yield briefly to let browser render before heavy work
    await new Promise((r) => setTimeout(r, 0))

    await inferCorners(videoFrame)

    if (captureRequested.value) {
      captureRequested.value = false
      const finalFrame = getFrame()
      if (finalFrame) {
        await inferCorners(copyImageData(finalFrame))
        if (currentCorners.value) {
          const page = postprocessImage(finalFrame, currentCorners.value)
          if (page && currentDocument.value) {
            currentDocument.value.pages.push(page)
            currentDocument.value.updatedAt = Date.now()
          }
        }
      }
    }

    // Keep frame timing consistent, avoid blocking next frame
    const elapsed = performance.now() - frameStart
    const delay = Math.max(0, frameDuration - elapsed)
    scannerTimer = setTimeout(() => {
      scannerFrame = requestAnimationFrame(scannerLoop)
    }, delay)
  }

  const removePage = (pageIndex: number) => {
    if (!currentDocument.value) return
    currentDocument.value.pages.splice(pageIndex, 1)
    currentDocument.value.updatedAt = Date.now()
  }

  return {
    track,
    tracks,
    selectTrack,
    isStarting,
    isStarted,
    error,
    startScanner,
    stopScanner,
    createNewDocument,
    removePage,
    isStable,
    currentDocument,
    autoCaptureProgress: progress,
    autoCaptureDelay: delay,
    captureRequested,
  }
}
