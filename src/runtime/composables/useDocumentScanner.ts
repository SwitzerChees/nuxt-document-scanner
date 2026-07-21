import { computed, ref } from 'vue'
import type {
  CaptureState,
  Document,
  DocumentPage,
  DocumentProcessingProfile,
  DocumentScannerOptions,
  QualityAssessment,
  ScannerError,
  ScannerErrorCode,
  ScannerState,
} from '../types'
import { useStream, type CapturedFrame } from './useStream'
import { useCornerDetection } from './useCornerDetection'
import { useAutoCapture } from './useAutoCapture'
import { drawOverlay } from '../utils/overlay'
import { selectCaptureCorners } from '../utils/capture-corners'
import { usePostprocessing } from './usePostprocessing'
import { assessImageQuality } from '../utils/processing-core'
import { calculateQuadArea } from '../utils/document-geometry'

const cameraErrorCode = (value: unknown): ScannerErrorCode => {
  if (!globalThis.isSecureContext) return 'insecure-context'
  const name = value instanceof DOMException ? value.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission-denied'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'camera-not-found'
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'camera-in-use'
  return 'camera-start'
}

const errorMessage = (value: unknown, fallback: string) =>
  value instanceof Error ? value.message : String(value || fallback)

const scannerError = (
  code: ScannerErrorCode,
  message: string,
  cause?: unknown,
  recoverable = true,
): ScannerError => ({ code, message, cause, recoverable })

export function useDocumentScanner(opts: DocumentScannerOptions) {
  const captureRequested = ref(false)
  const isCapturingFrame = ref(false)
  const isProcessingCapture = ref(false)
  const showCaptureFlash = ref(false)
  const currentDocument = ref<Document>()
  const state = ref<ScannerState>('idle')
  const captureState = ref<CaptureState>('idle')
  const lastError = ref<ScannerError>()
  const captureError = ref<ScannerError>()
  const isStarting = ref(false)
  const currentQuality = ref<QualityAssessment>()
  const { videoOptions, overlay, capture: captureOptions } = opts
  const { worker: workerOptions } = opts
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
    selectedDeviceId,
    cameraState,
    cameraSettings,
    cameraCapabilities,
    getFrame,
    captureHighResolutionFrame,
    streamFrameRate,
  } = stream
  const detection = useCornerDetection({
    worker: workerOptions,
    capture: captureOptions,
  })
  const {
    isInitialized,
    detectCorners,
    inferCorners,
    isStable,
    initializeDetection,
    disposeWorker,
    currentCorners,
    currentConfidence,
    resetTracking,
  } = detection
  const autoCapture = useAutoCapture(captureOptions.autoCapture)
  const processing = usePostprocessing({
    maxOutputPixels: captureOptions.maxOutputPixels,
    maxOutputLongEdge: captureOptions.maxOutputLongEdge,
    jpegQuality: captureOptions.jpegQuality,
    thumbnailLongEdge: captureOptions.thumbnailLongEdge,
  })
  const {
    updateProgress,
    canAutoCapture,
    reset,
    requireFreshTarget,
    startCooldown,
    progress,
    delay,
  } = autoCapture
  const isStarted = computed(() => isStreaming.value)
  const isDetectorReady = computed(() => isInitialized.value)
  const isBusy = computed(
    () => isCapturingFrame.value || isProcessingCapture.value,
  )
  const error = computed(
    () => captureError.value?.message || lastError.value?.message,
  )
  const detectionMaxSize = Math.max(256, workerOptions.detectionMaxSize || 256)
  const maxDetectionFrameRate = 12
  let loopActive = false
  let scannerTimer: ReturnType<typeof setTimeout> | undefined
  let scannerFrame = 0
  let overlayFrame = 0
  let startSequence = 0
  let activeCapture: Promise<boolean> | undefined
  let successTimer: ReturnType<typeof setTimeout> | undefined
  let flashTimer: ReturnType<typeof setTimeout> | undefined
  let replacementPageIndex: number | undefined
  let deletedPage: { page: DocumentPage; index: number } | undefined
  let detectionCanvas: HTMLCanvasElement | undefined
  let detectionCanvasContext: CanvasRenderingContext2D | null = null
  let detectionSourceCanvas: HTMLCanvasElement | undefined
  let detectionSourceContext: CanvasRenderingContext2D | null = null

  const createNewDocument = () => {
    for (const page of currentDocument.value?.pages || []) {
      processing.revokePageUrls(page)
    }
    if (deletedPage) processing.revokePageUrls(deletedPage.page)
    deletedPage = undefined
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

  const clearTimers = () => {
    if (scannerTimer) clearTimeout(scannerTimer)
    if (scannerFrame) cancelAnimationFrame(scannerFrame)
    if (overlayFrame) cancelAnimationFrame(overlayFrame)
    if (successTimer) clearTimeout(successTimer)
    if (flashTimer) clearTimeout(flashTimer)
    scannerTimer = undefined
    scannerFrame = 0
    overlayFrame = 0
    successTimer = undefined
    flashTimer = undefined
  }

  const clearError = () => {
    lastError.value = undefined
    captureError.value = undefined
    if (state.value === 'error') state.value = isStarted.value ? 'live' : 'idle'
    if (captureState.value === 'error') captureState.value = 'idle'
  }

  const scaleCornersToFrame = (
    corners: number[],
    frame: { scaleX: number; scaleY: number },
  ) =>
    corners.map((value, index) =>
      index % 2 === 0 ? value / frame.scaleX : value / frame.scaleY,
    )

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

  const fallbackCorners = (frame: ImageData) => {
    const insetX = Math.max(1, frame.width * 0.02)
    const insetY = Math.max(1, frame.height * 0.02)
    return [
      insetX,
      insetY,
      frame.width - insetX,
      insetY,
      frame.width - insetX,
      frame.height - insetY,
      insetX,
      frame.height - insetY,
    ]
  }

  const triggerFlash = () => {
    showCaptureFlash.value = true
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => {
      showCaptureFlash.value = false
      flashTimer = undefined
    }, 140)
  }

  const performCapture = () => {
    if (activeCapture) return activeCapture
    if (!isStarted.value) return Promise.resolve(false)
    const sequence = startSequence
    captureRequested.value = false
    captureError.value = undefined
    captureState.value = 'capturing'
    state.value = 'capturing'
    reset(false)

    activeCapture = (async () => {
      try {
        const liveFrameSize = video.value
          ? { width: video.value.videoWidth, height: video.value.videoHeight }
          : undefined
        const liveCorners = currentCorners.value?.slice()
        isCapturingFrame.value = true
        const finalFrame = (await captureHighResolutionFrame()) || getFrame()
        if (sequence !== startSequence) return false
        if (!finalFrame) throw new Error('Camera did not provide a capture frame.')
        isCapturingFrame.value = false
        triggerFlash()
        captureState.value = 'processing'
        state.value = 'processing'
        isProcessingCapture.value = true

        const finalDetectionFrame = isDetectorReady.value
          ? createDetectionFrame(finalFrame, detectionMaxSize)
          : undefined
        const finalDetection = finalDetectionFrame
          ? await detectCorners(finalDetectionFrame.imageData, {
              scaleX: finalDetectionFrame.scaleX,
              scaleY: finalDetectionFrame.scaleY,
            })
          : undefined
        if (sequence !== startSequence) return false
        const corners =
          selectCaptureCorners({
            detectedCorners: finalDetection?.corners,
            liveCorners,
            liveFrameSize,
            finalFrameSize: {
              width: finalFrame.imageData.width,
              height: finalFrame.imageData.height,
            },
            isHighResolution: finalFrame.isHighResolution,
          }) || fallbackCorners(finalFrame.imageData)

        const page = await processing.process({
          imageData: finalFrame.imageData,
          corners: scaleCornersToFrame(corners, finalFrame),
          profile: captureOptions.processingProfile,
          quadConfidence: finalDetection?.confidence || currentConfidence.value,
        })
        if (!page) throw new Error('Image processing returned no page.')
        if (!currentDocument.value) createNewDocument()
        if (sequence !== startSequence || !currentDocument.value) {
          processing.revokePageUrls(page)
          return false
        }
        if (
          replacementPageIndex !== undefined &&
          currentDocument.value.pages[replacementPageIndex]
        ) {
          const replaced = currentDocument.value.pages[replacementPageIndex]!
          currentDocument.value.pages.splice(replacementPageIndex, 1, page)
          processing.revokePageUrls(replaced)
          replacementPageIndex = undefined
        } else {
          currentDocument.value.pages.push(page)
        }
        currentDocument.value.updatedAt = Date.now()
        captureState.value = 'success'
        state.value = 'live'
        successTimer = setTimeout(() => {
          if (captureState.value === 'success') captureState.value = 'idle'
        }, 900)
        return true
      } catch (cause) {
        if (sequence !== startSequence) return false
        const message = errorMessage(cause, 'Page capture failed.')
        captureError.value = scannerError(
          captureState.value === 'processing'
            ? 'processing-failed'
            : 'capture-failed',
          message,
          cause,
        )
        captureState.value = 'error'
        state.value = 'live'
        return false
      } finally {
        if (sequence === startSequence) {
          isCapturingFrame.value = false
          isProcessingCapture.value = false
          requireFreshTarget(true)
        }
      }
    })().finally(() => {
      activeCapture = undefined
    })
    return activeCapture
  }

  const requestCapture = () => {
    if (!isStarted.value || isBusy.value) return false
    captureRequested.value = true
    return true
  }

  const scheduleScannerLoop = (delayMs = 0) => {
    if (!loopActive) return
    scannerTimer = setTimeout(() => {
      scannerFrame = requestAnimationFrame(() => void scannerLoop())
    }, delayMs)
  }

  const scannerLoop = async () => {
    if (!loopActive) return
    const sequence = startSequence
    const startedAt = performance.now()
    const frameRate = Math.min(
      Math.max(streamFrameRate.value || maxDetectionFrameRate, 1),
      maxDetectionFrameRate,
    )
    const frameDuration = 1000 / frameRate
    try {
      if (needsRestart.value) {
        needsRestart.value = false
        await restartStream()
        if (sequence !== startSequence) return
      }
      if (!isStreaming.value || !isDetectorReady.value) return
      const videoFrame = getFrame(detectionMaxSize)
      if (!videoFrame) return
      const scaledWidth = videoFrame.imageData.width * videoFrame.scaleX
      const scaledHeight = videoFrame.imageData.height * videoFrame.scaleY
      const frameQuality = assessImageQuality(videoFrame.imageData, {
        coverage: currentCorners.value
          ? calculateQuadArea(currentCorners.value) / (scaledWidth * scaledHeight)
          : 0,
        quadConfidence: currentConfidence.value,
      })
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      if (sequence !== startSequence) return
      await inferCorners(videoFrame.imageData, {
        scaleX: videoFrame.scaleX,
        scaleY: videoFrame.scaleY,
      })
      currentQuality.value = frameQuality
    } catch (cause) {
      if (sequence === startSequence) {
        lastError.value = scannerError(
          'camera-interrupted',
          errorMessage(cause, 'Camera stream was interrupted.'),
          cause,
        )
      }
    } finally {
      if (loopActive && sequence === startSequence) {
        scheduleScannerLoop(
          Math.max(0, frameDuration - (performance.now() - startedAt)),
        )
      }
    }
  }

  const animationLoop = () => {
    if (!loopActive) return
    if (video.value && overlay.value && isStreaming.value) {
      drawOverlay({
        canvas: overlay.value,
        video: video.value,
        corners: currentCorners.value,
      })
    }
    if (captureRequested.value && !isBusy.value) {
      void performCapture()
    } else if (isBusy.value || !isDetectorReady.value) {
      reset(false)
    } else {
      updateProgress(
        isStable.value && Boolean(currentQuality.value?.acceptableForAutoCapture),
      )
      if (canAutoCapture()) {
        captureRequested.value = true
        reset(false)
      }
    }
    overlayFrame = requestAnimationFrame(animationLoop)
  }

  const startScanner = async () => {
    if (isStarting.value || isStarted.value) return
    const sequence = ++startSequence
    isStarting.value = true
    clearError()
    state.value = 'requesting-permission'
    try {
      await startStream()
      if (sequence !== startSequence) {
        stopStream()
        return
      }
      if (!currentDocument.value) createNewDocument()
      state.value = 'camera-ready'
      loopActive = true
      scheduleScannerLoop()
      animationLoop()
      if (currentDocument.value?.pages.length) requireFreshTarget(true)
      else startCooldown(600)

      state.value = 'detector-loading'
      try {
        await initializeDetection()
        if (sequence !== startSequence) return
        state.value = 'live'
      } catch (cause) {
        if (sequence !== startSequence) return
        lastError.value = scannerError(
          'detector-load',
          'Automatic edge detection is unavailable. Manual capture still works.',
          cause,
        )
        state.value = 'live'
      }
    } catch (cause) {
      if (sequence !== startSequence) return
      const code = cameraErrorCode(cause)
      lastError.value = scannerError(
        code,
        errorMessage(cause, 'Camera could not start.'),
        cause,
        code !== 'insecure-context',
      )
      state.value = 'error'
      loopActive = false
      clearTimers()
      stopStream()
    } finally {
      if (sequence === startSequence) isStarting.value = false
    }
  }

  const pauseScanner = () => {
    startSequence++
    isStarting.value = false
    loopActive = false
    clearTimers()
    captureRequested.value = false
    isCapturingFrame.value = false
    isProcessingCapture.value = false
    showCaptureFlash.value = false
    reset(false)
    resetTracking()
    currentQuality.value = undefined
    stopStream()
    state.value = 'paused'
  }

  const stopScanner = () => {
    pauseScanner()
    void disposeWorker()
    state.value = 'idle'
    captureState.value = 'idle'
    lastError.value = undefined
    captureError.value = undefined
    if (detectionCanvas) {
      detectionCanvas.width = 1
      detectionCanvas.height = 1
    }
    if (detectionSourceCanvas) {
      detectionSourceCanvas.width = 1
      detectionSourceCanvas.height = 1
    }
  }

  const disposeScanner = () => {
    stopScanner()
    processing.dispose()
    for (const page of currentDocument.value?.pages || []) {
      processing.revokePageUrls(page)
    }
    if (deletedPage) processing.revokePageUrls(deletedPage.page)
    deletedPage = undefined
  }

  const resumeScanner = () => startScanner()

  const retryScanner = async () => {
    clearError()
    if (!isStarted.value) {
      await startScanner()
      return
    }
    state.value = 'detector-loading'
    try {
      await initializeDetection()
      state.value = 'live'
    } catch (cause) {
      lastError.value = scannerError(
        'detector-load',
        'Automatic edge detection is unavailable. Manual capture still works.',
        cause,
      )
      state.value = 'live'
    }
  }

  const removePage = (pageIndex: number) => {
    if (!currentDocument.value) return
    const page = currentDocument.value.pages[pageIndex]
    if (!page) return
    if (deletedPage) processing.revokePageUrls(deletedPage.page)
    currentDocument.value.pages.splice(pageIndex, 1)
    deletedPage = { page, index: pageIndex }
    currentDocument.value.updatedAt = Date.now()
  }

  const canUndoDelete = computed(() => Boolean(deletedPage))

  const undoRemovePage = () => {
    if (!currentDocument.value || !deletedPage) return false
    currentDocument.value.pages.splice(
      Math.min(deletedPage.index, currentDocument.value.pages.length),
      0,
      deletedPage.page,
    )
    deletedPage = undefined
    currentDocument.value.updatedAt = Date.now()
    return true
  }

  const reprocessPage = async (
    pageIndex: number,
    changes: {
      profile?: DocumentProcessingProfile
      rotation?: 0 | 90 | 180 | 270
      quad?: number[]
    },
  ) => {
    const document = currentDocument.value
    const page = document?.pages[pageIndex]
    if (!document || !page || isBusy.value) return false
    isProcessingCapture.value = true
    captureState.value = 'processing'
    try {
      const replacement = await processing.replacePage(page, changes)
      if (document !== currentDocument.value || document.pages[pageIndex] !== page) {
        processing.revokePageUrls(replacement)
        return false
      }
      document.pages.splice(pageIndex, 1, replacement)
      processing.revokePageUrls(page)
      document.updatedAt = Date.now()
      captureState.value = 'success'
      return true
    } catch (cause) {
      captureError.value = scannerError(
        'processing-failed',
        errorMessage(cause, 'Page processing failed.'),
        cause,
      )
      captureState.value = 'error'
      return false
    } finally {
      isProcessingCapture.value = false
    }
  }

  const rotatePage = (pageIndex: number) => {
    const page = currentDocument.value?.pages[pageIndex]
    if (!page) return Promise.resolve(false)
    const rotation = ((page.rotation + 90) % 360) as 0 | 90 | 180 | 270
    return reprocessPage(pageIndex, { rotation })
  }

  const updatePageProfile = (
    pageIndex: number,
    profile: DocumentProcessingProfile,
  ) => reprocessPage(pageIndex, { profile })

  const updatePageQuad = (pageIndex: number, quad: number[]) =>
    reprocessPage(pageIndex, { quad })

  const reorderPage = (from: number, to: number) => {
    const pages = currentDocument.value?.pages
    if (!pages || from === to || from < 0 || to < 0 || from >= pages.length || to >= pages.length) {
      return false
    }
    const [page] = pages.splice(from, 1)
    if (!page) return false
    pages.splice(to, 0, page)
    currentDocument.value!.updatedAt = Date.now()
    return true
  }

  const requestRetakePage = (pageIndex: number) => {
    if (!currentDocument.value?.pages[pageIndex]) return false
    replacementPageIndex = pageIndex
    return true
  }

  return {
    track,
    tracks,
    selectedDeviceId,
    cameraState,
    cameraSettings,
    cameraCapabilities,
    selectTrack,
    isStarting,
    isStarted,
    isDetectorReady,
    isBusy,
    state,
    captureState,
    lastError,
    captureError,
    error,
    clearError,
    startScanner,
    resumeScanner,
    retryScanner,
    pauseScanner,
    stopScanner,
    disposeScanner,
    requestCapture,
    createNewDocument,
    removePage,
    undoRemovePage,
    canUndoDelete,
    rotatePage,
    updatePageProfile,
    updatePageQuad,
    reorderPage,
    requestRetakePage,
    isStable,
    currentConfidence,
    currentQuality,
    currentDocument,
    autoCaptureProgress: progress,
    autoCaptureDelay: delay,
    captureRequested,
    isCapturingFrame,
    isProcessingCapture,
    showCaptureFlash,
  }
}
