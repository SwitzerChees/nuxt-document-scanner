import { computed, ref } from 'vue'
import type { Document, DocumentScannerOptions } from '../types'
import { useStream, type CapturedFrame } from './useStream'
import { useCornerDetection } from './useCornerDetection'
import { useAutoCapture } from './useAutoCapture'
import { postprocessImage } from '../utils/image-postprocessing'
import { drawOverlay, isValidRectangle } from '../utils/overlay'
import { loadOpenCV } from '../utils/opencv'

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
  const { getFrame, captureHighResolutionFrame, streamFrameRate } = stream

  const {
    isInitialized,
    detectCorners,
    inferCorners,
    isStable,
    initializeDetection,
    disposeWorker,
    currentCorners,
  } = useCornerDetection({
    worker: workerOptions,
    capture: captureOptions,
  })

  const autoCapture = useAutoCapture(captureOptions.autoCapture)
  const { updateProgress, canAutoCapture, reset, progress, delay } = autoCapture

  const isStarting = ref(false)
  const isStarted = computed(() => isInitialized.value && isStreaming.value)
  const detectionMaxSize = Math.max(256, workerOptions.detectionMaxSize || 640)
  const maxDetectionFrameRate = 12
  let loopActive = false
  let scannerTimer: ReturnType<typeof setTimeout> | undefined
  let scannerFrame = 0
  let overlayFrame = 0
  let startSequence = 0
  let openCVPromise: Promise<boolean> | undefined
  let detectionCanvas: HTMLCanvasElement | undefined
  let detectionCanvasContext: CanvasRenderingContext2D | null = null
  let detectionSourceCanvas: HTMLCanvasElement | undefined
  let detectionSourceContext: CanvasRenderingContext2D | null = null

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
    const sequence = ++startSequence

    try {
      await initializeDetection()
      if (sequence !== startSequence) return
      await startStream()
      if (sequence !== startSequence) {
        stopStream()
        return
      }
      if (!currentDocument.value) createNewDocument()
      loopActive = true
      scannerLoop()
      animationLoop()
    } catch (e) {
      if (sequence === startSequence) {
        error.value = getErrorMessage(e)
        stopScanner()
      }
    } finally {
      if (sequence === startSequence) isStarting.value = false
    }
  }

  const stopScanner = () => {
    startSequence++
    isStarting.value = false
    loopActive = false
    if (scannerTimer) clearTimeout(scannerTimer)
    if (scannerFrame) cancelAnimationFrame(scannerFrame)
    if (overlayFrame) cancelAnimationFrame(overlayFrame)
    scannerTimer = undefined
    scannerFrame = 0
    overlayFrame = 0
    captureRequested.value = false
    stopStream()
    void disposeWorker()
    if (detectionCanvas) {
      detectionCanvas.width = 1
      detectionCanvas.height = 1
    }
    if (detectionSourceCanvas) {
      detectionSourceCanvas.width = 1
      detectionSourceCanvas.height = 1
    }
  }

  const ensureOpenCVReady = async () => {
    openCVPromise ||= loadOpenCV(opencvUrl).catch((loadError) => {
      openCVPromise = undefined
      throw loadError
    })
    return openCVPromise
  }

  const scaleCornersToFrame = (corners: number[], frame: { scaleX: number, scaleY: number }) => {
    return corners.map((value, index) =>
      index % 2 === 0 ? value / frame.scaleX : value / frame.scaleY,
    )
  }

  const scaleCornersBetweenSizes = (
    corners: number[],
    source: { width: number, height: number },
    target: { width: number, height: number },
  ) => {
    const scaleX = target.width / source.width
    const scaleY = target.height / source.height
    return corners.map((value, index) =>
      index % 2 === 0 ? value * scaleX : value * scaleY,
    )
  }

  const createDetectionFrame = (
    frame: CapturedFrame,
    maxSize: number,
  ): CapturedFrame | undefined => {
    const source = frame.imageData
    const scale =
      Math.max(source.width, source.height) > maxSize
        ? maxSize / Math.max(source.width, source.height)
        : 1
    const outputWidth = Math.max(1, Math.round(source.width * scale))
    const outputHeight = Math.max(1, Math.round(source.height * scale))

    detectionSourceCanvas ||= document.createElement('canvas')
    detectionCanvas ||= document.createElement('canvas')
    detectionSourceContext ||= detectionSourceCanvas.getContext('2d')
    detectionCanvasContext ||= detectionCanvas.getContext('2d', {
      willReadFrequently: true,
    })
    if (!detectionSourceContext || !detectionCanvasContext) return

    if (
      detectionSourceCanvas.width !== source.width ||
      detectionSourceCanvas.height !== source.height
    ) {
      detectionSourceCanvas.width = source.width
      detectionSourceCanvas.height = source.height
    }
    if (
      detectionCanvas.width !== outputWidth ||
      detectionCanvas.height !== outputHeight
    ) {
      detectionCanvas.width = outputWidth
      detectionCanvas.height = outputHeight
    }

    detectionSourceContext.putImageData(source, 0, 0)
    detectionCanvasContext.drawImage(
      detectionSourceCanvas,
      0,
      0,
      outputWidth,
      outputHeight,
    )

    return {
      imageData: detectionCanvasContext.getImageData(
        0,
        0,
        outputWidth,
        outputHeight,
      ),
      scaleX: source.width / outputWidth,
      scaleY: source.height / outputHeight,
    }
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
    const frameRate = Math.min(
      Math.max(streamFrameRate.value || maxDetectionFrameRate, 1),
      maxDetectionFrameRate,
    )
    const frameDuration = 1000 / frameRate

    if (needsRestart.value) {
      needsRestart.value = false
      await restartStream()
    }

    const videoFrame = getFrame(detectionMaxSize)
    if (!videoFrame) {
      scannerFrame = requestAnimationFrame(scannerLoop)
      return
    }

    // Yield briefly to let browser render before heavy work
    await new Promise((r) => setTimeout(r, 0))

    await inferCorners(videoFrame.imageData, {
      scaleX: videoFrame.scaleX,
      scaleY: videoFrame.scaleY,
    })

    if (captureRequested.value) {
      captureRequested.value = false
      const liveFrameSize = video.value
        ? { width: video.value.videoWidth, height: video.value.videoHeight }
        : undefined
      const finalFrame = (await captureHighResolutionFrame()) || getFrame()
      const finalDetectionFrame = finalFrame
        ? createDetectionFrame(finalFrame, detectionMaxSize)
        : undefined
      if (finalFrame && finalDetectionFrame) {
        const detectedCorners = await detectCorners(finalDetectionFrame.imageData, {
          scaleX: finalDetectionFrame.scaleX,
          scaleY: finalDetectionFrame.scaleY,
        })
        const fallbackCorners =
          currentCorners.value && finalFrame.isHighResolution && liveFrameSize
            ? scaleCornersBetweenSizes(currentCorners.value, liveFrameSize, {
                width: finalFrame.imageData.width,
                height: finalFrame.imageData.height,
              })
            : currentCorners.value
        const corners =
          detectedCorners && isValidRectangle(detectedCorners)
            ? detectedCorners
            : fallbackCorners
        if (corners) {
          await ensureOpenCVReady().catch((loadError) => {
            console.warn('OpenCV failed to load; using crop fallback.', loadError)
          })
          const page = postprocessImage(
            finalFrame.imageData,
            scaleCornersToFrame(corners, finalFrame),
          )
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
