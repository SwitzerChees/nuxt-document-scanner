import { computed, ref } from 'vue'
import type { CaptureState, Document, DocumentPage, DocumentProcessingProfile, DocumentScannerCamera, DocumentScannerOptions, QualityAssessment, ScannerError, ScannerErrorCode, ScannerState, } from '../types'
import { useStream } from './useStream'
import { useCornerDetection } from './useCornerDetection'
import { drawOverlay } from '../utils/overlay'
import { usePostprocessing } from './usePostprocessing'
import { calculateQuadArea } from '../utils/document-geometry'
import { maxCornerShift } from '../engine/geometry'
import type { Quad } from '../engine/geometry'

const cameraErrorCode = (value: unknown): ScannerErrorCode => {
  if (!globalThis.isSecureContext)
    return 'insecure-context'
  const name = value instanceof DOMException ? value.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'permission-denied'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError')
    return 'camera-not-found'
  if (name === 'NotReadableError' || name === 'TrackStartError')
    return 'camera-in-use'
  return 'camera-start'
}
const errorMessage = (value: unknown, fallback: string) => value instanceof Error ? value.message : String(value || fallback)
const cameraErrorMessage = (code: ScannerErrorCode) => {
  const messages: Partial<Record<ScannerErrorCode, string>> = {
    'permission-denied': 'Camera access was denied. Allow camera access in your browser or system settings, then retry.',
    'camera-not-found': 'No camera was found. Connect a camera or choose another device.',
    'camera-in-use': 'The camera is being used by another app. Close it there, then retry.',
    'insecure-context': 'Camera access requires HTTPS or localhost.',
    'camera-interrupted': 'The camera stream was interrupted. Retry to reconnect.',
    'camera-start': 'The camera could not start. Check its permission and retry.',
  }
  return messages[code] || 'The camera could not start.'
}
const scannerError = (code: ScannerErrorCode, message: string, cause?: unknown, recoverable = true): ScannerError => ({ code, message, cause, recoverable })
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
  const { needsRestart, restartStream, selectTrack: selectCameraTrack, startStream, stopStream, isStreaming, track, tracks, selectedDeviceId, cameraState, cameraSettings, cameraCapabilities, isSwitchingCamera, getDetectionFrame, captureBurst, captureStill, torchOn, torchSupported, setTorch, focusAt, streamFrameRate, } = stream
  const detection = useCornerDetection({
    worker: workerOptions,
    capture: captureOptions,
  })
  const { isInitialized, detectCorners, inferCorners, isStable, initializeDetection, disposeWorker, currentCorners, currentConfidence, resetTracking, waitForInferenceIdle, progress, shouldCapture, hint: trackingHint, markCaptured, } = detection
  const processing = usePostprocessing({
    maxOutputPixels: captureOptions.maxOutputPixels,
    maxOutputLongEdge: captureOptions.maxOutputLongEdge,
    jpegQuality: captureOptions.jpegQuality,
    thumbnailLongEdge: captureOptions.thumbnailLongEdge,
  })
  const delay = captureOptions.stableDuration + captureOptions.autoCapture.delay
  let rememberedAuto = true
  try {
    rememberedAuto = localStorage.getItem('nuxt-document-scanner.autoCapture') !== 'off'
  } catch { /* SSR or private browsing */ }
  const autoCaptureEnabled = ref(captureOptions.autoCapture.enabled && rememberedAuto)
  detection.setAutoCapture(autoCaptureEnabled.value)
  const setAutoCapture = (enabled: boolean) => {
    autoCaptureEnabled.value = enabled
    detection.setAutoCapture(enabled)
    try {
      localStorage.setItem('nuxt-document-scanner.autoCapture', enabled ? 'on' : 'off')
    } catch { /* private browsing */ }
  }
  let nextCaptureAt = 0
  const reset = (_cooldown?: boolean) => {
    progress.value = 0
    shouldCapture.value = false
  }
  const requireFreshTarget = (_fresh?: boolean) => {
    markCaptured()
    nextCaptureAt = performance.now() + captureOptions.autoCapture.cooldown
  }
  const startCooldown = (_delay?: number) => reset()
  const isStarted = computed(() => isStreaming.value)
  const isDetectorReady = computed(() => isInitialized.value)
  const isBusy = computed(() => isCapturingFrame.value ||
        isProcessingCapture.value ||
        isSwitchingCamera.value)
  const error = computed(() => captureError.value?.message || lastError.value?.message)
  const detectionMaxSize = Math.max(256, workerOptions.detectionMaxSize || 256)
  const maxDetectionFrameRate = 10
  let loopActive = false
  let scannerTimer: ReturnType<typeof setTimeout> | undefined
  let scannerFrame = 0
  let overlayFrame = 0
  let startSequence = 0
  let activeCapture: Promise<boolean> | undefined
  let successTimer: ReturnType<typeof setTimeout> | undefined
  let flashTimer: ReturnType<typeof setTimeout> | undefined
  let replacementPageIndex: number | undefined
  const deletedPage = ref<{
    page: DocumentPage;
    index: number;
  }>()
  const pageBytes = (page: DocumentPage) => page.processed.size + page.thumbnail.size + (page.preview?.size ?? 0) + (page.source?.size ?? 0)
  const assertPageBudget = (page: DocumentPage, replacing?: number) => {
    const pages = currentDocument.value?.pages ?? []
    const bytes = pages.reduce((sum, p, i) => sum + (i === replacing ? 0 : pageBytes(p)), deletedPage.value ? pageBytes(deletedPage.value.page) : 0)
    if ((replacing === undefined && pages.length >= 20) || bytes + pageBytes(page) > 80 * 1024 * 1024) {
      processing.revokePageUrls(page)
      throw new Error('Scan limit reached (20 pages or 80 MiB). Export this document before adding more pages.')
    }
  }
  const createNewDocument = () => {
    for (const page of currentDocument.value?.pages || []) {
      processing.revokePageUrls(page)
    }
    if (deletedPage.value)
      processing.revokePageUrls(deletedPage.value.page)
    deletedPage.value = undefined
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
    if (scannerTimer)
      clearTimeout(scannerTimer)
    if (scannerFrame)
      cancelAnimationFrame(scannerFrame)
    if (overlayFrame)
      cancelAnimationFrame(overlayFrame)
    if (successTimer)
      clearTimeout(successTimer)
    if (flashTimer)
      clearTimeout(flashTimer)
    scannerTimer = undefined
    scannerFrame = 0
    overlayFrame = 0
    successTimer = undefined
    flashTimer = undefined
  }
  const clearError = () => {
    lastError.value = undefined
    captureError.value = undefined
    if (state.value === 'error')
      state.value = isStarted.value ? 'live' : 'idle'
    if (captureState.value === 'error')
      captureState.value = 'idle'
  }
  const fallbackCorners = (frame: {
    width: number;
    height: number;
  }) => {
    const insetX = 0
    const insetY = 0
    return [
      insetX,
      insetY,
      frame.width - 1 - insetX,
      insetY,
      frame.width - 1 - insetX,
      frame.height - 1 - insetY,
      insetX,
      frame.height - 1 - insetY,
    ]
  }
  const triggerFlash = () => {
    showCaptureFlash.value = true
    if (flashTimer)
      clearTimeout(flashTimer)
    flashTimer = setTimeout(() => {
      showCaptureFlash.value = false
      flashTimer = undefined
    }, 140)
  }
  const performCapture = () => {
    if (activeCapture)
      return activeCapture
    if (!isStarted.value)
      return Promise.resolve(false)
    const sequence = startSequence
    captureRequested.value = false
    captureError.value = undefined
    captureState.value = 'capturing'
    state.value = 'capturing'
    reset(false)
    activeCapture = (async () => {
      let frames: ImageBitmap[] = []
      try {
        isCapturingFrame.value = true
        await waitForInferenceIdle()
        const liveSize = { width: video.value!.videoWidth, height: video.value!.videoHeight }
        const liveCorners = currentCorners.value?.slice()
        frames = await captureBurst()
        if (sequence !== startSequence)
          return false
        if (!frames.length)
          throw new Error('Camera did not provide a capture frame.')
        let corners = liveCorners
        let quadConfidence = currentConfidence.value
        let sourceKind: 'photo' | 'video' = 'video'
        const still = await captureStill()
        if (sequence !== startSequence)
          return false
        if (still && isDetectorReady.value) {
          const photo = await createImageBitmap(still)
          try {
            const scale = Math.min(1, detectionMaxSize / Math.max(photo.width, photo.height))
            const small = await createImageBitmap(photo, { resizeWidth: Math.max(1, Math.round(photo.width * scale)), resizeHeight: Math.max(1, Math.round(photo.height * scale)), resizeQuality: 'medium' })
            const found = await detectCorners(small, { scaleX: photo.width / small.width, scaleY: photo.height / small.height })
            const fresh = await getDetectionFrame(detectionMaxSize)
            const now = fresh ? await detectCorners(fresh, { scaleX: liveSize.width / fresh.width, scaleY: liveSize.height / fresh.height }) : undefined
            const quad = (q: number[]) => [0, 2, 4, 6].map(i => ({ x: q[i]!, y: q[i + 1]! })) as Quad
            const moved = !liveCorners || !now?.corners || now.confidence < captureOptions.minimumDetectionConfidence ||
                            maxCornerShift(quad(liveCorners), quad(now.corners)) / Math.hypot(liveSize.width, liveSize.height) > 0.02
            if (!moved && found.corners && found.confidence >= captureOptions.minimumDetectionConfidence) {
              frames.forEach(frame => frame.close())
              frames = [photo]
              corners = found.corners
              quadConfidence = found.confidence
              sourceKind = 'photo'
            }
          }
          finally {
            if (frames[0] !== photo)
              photo.close()
          }
        }
        if (sequence !== startSequence)
          return false
        isCapturingFrame.value = false
        triggerFlash()
        captureState.value = 'processing'
        state.value = 'processing'
        isProcessingCapture.value = true
        const sourceSize = { width: frames[0]!.width, height: frames[0]!.height }
        if (corners && sourceKind === 'video')
          corners = corners.map((v, i) => v * (i % 2 ? sourceSize.height / liveSize.height : sourceSize.width / liveSize.width))
        if (!corners) {
          corners = fallbackCorners(sourceSize)
          quadConfidence = 0
        }
        const page = await processing.process({
          frames, corners, profile: captureOptions.processingProfile, quadConfidence,
          refine: quadConfidence >= captureOptions.minimumDetectionConfidence, retainSource: opts.keepSource !== false,
        })
        frames = []
        page.captureSource = { kind: sourceKind, ...sourceSize }
        if (!page)
          throw new Error('Image processing returned no page.')
        if (!currentDocument.value)
          createNewDocument()
        if (sequence !== startSequence || !currentDocument.value) {
          processing.revokePageUrls(page)
          return false
        }
        assertPageBudget(page, replacementPageIndex)
        navigator.vibrate?.(30)
        if (replacementPageIndex !== undefined &&
                    currentDocument.value.pages[replacementPageIndex]) {
          const replaced = currentDocument.value.pages[replacementPageIndex]!
          currentDocument.value.pages.splice(replacementPageIndex, 1, page)
          processing.revokePageUrls(replaced)
          replacementPageIndex = undefined
        }
        else {
          currentDocument.value.pages.push(page)
        }
        currentDocument.value.updatedAt = Date.now()
        captureState.value = 'success'
        state.value = 'live'
        successTimer = setTimeout(() => {
          if (captureState.value === 'success')
            captureState.value = 'idle'
        }, 900)
        return true
      }
      catch (cause) {
        if (sequence !== startSequence)
          return false
        const message = errorMessage(cause, 'Page capture failed.')
        captureError.value = scannerError(captureState.value === 'processing'
          ? 'processing-failed'
          : 'capture-failed', message, cause)
        captureState.value = 'error'
        state.value = 'live'
        return false
      }
      finally {
        frames.forEach(frame => frame.close())
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
    if (!isStarted.value || isBusy.value)
      return false
    captureRequested.value = true
    return true
  }
  const selectTrack = async (camera: DocumentScannerCamera) => {
    if (isBusy.value)
      return false
    reset(false)
    resetTracking()
    currentQuality.value = undefined
    try {
      const switched = await selectCameraTrack(camera)
      if (switched) {
        requireFreshTarget(true)
        state.value = 'live'
      }
      return switched
    }
    catch (cause) {
      const code = cameraErrorCode(cause)
      lastError.value = scannerError(code, cameraErrorMessage(code), cause)
      state.value = isStarted.value ? 'live' : 'error'
      return false
    }
  }
  const importPage = async (blob: Blob) => {
    if (isBusy.value || !blob.type.startsWith('image/'))
      return false
    captureError.value = undefined
    captureState.value = 'processing'
    state.value = 'processing'
    isProcessingCapture.value = true
    const sequence = startSequence
    let bitmap: ImageBitmap | undefined
    try {
      bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
      const scale = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height), Math.sqrt(12000000 / (bitmap.width * bitmap.height)))
      if (scale < 1) {
        const resized = await createImageBitmap(bitmap, { resizeWidth: Math.round(bitmap.width * scale), resizeHeight: Math.round(bitmap.height * scale), resizeQuality: 'high' })
        bitmap.close()
        bitmap = resized
      }
      let corners = fallbackCorners(bitmap), confidence = 0
      if (isDetectorReady.value) {
        await waitForInferenceIdle()
        const scale = Math.min(1, detectionMaxSize / Math.max(bitmap.width, bitmap.height))
        const small = await createImageBitmap(bitmap, { resizeWidth: Math.round(bitmap.width * scale), resizeHeight: Math.round(bitmap.height * scale), resizeQuality: 'medium' })
        const detected = await detectCorners(small, { scaleX: bitmap.width / small.width, scaleY: bitmap.height / small.height })
        if (detected.corners && detected.confidence >= captureOptions.minimumDetectionConfidence) {
          corners = detected.corners
          confidence = detected.confidence
        }
      }
      const page = await processing.process({ frames: [bitmap], corners, profile: captureOptions.processingProfile,
        quadConfidence: confidence, refine: confidence > 0, retainSource: opts.keepSource !== false })
      if (sequence !== startSequence) {
        processing.revokePageUrls(page)
        return false
      }
      assertPageBudget(page)
      if (!currentDocument.value)
        createNewDocument()
      currentDocument.value!.pages.push(page)
      currentDocument.value!.updatedAt = Date.now()
      captureState.value = 'success'
      state.value = isStarted.value ? 'live' : 'paused'
      return true
    }
    catch (cause) {
      if (sequence !== startSequence)
        return false
      captureError.value = scannerError('processing-failed', errorMessage(cause, 'The selected image could not be imported.'), cause)
      captureState.value = 'error'
      state.value = isStarted.value ? 'live' : 'error'
      return false
    }
    finally {
      bitmap?.close()
      if (sequence === startSequence)
        isProcessingCapture.value = false
    }
  }
  const scheduleScannerLoop = (delayMs = 0) => {
    if (!loopActive)
      return
    scannerTimer = setTimeout(() => {
      scannerFrame = requestAnimationFrame(() => void scannerLoop())
    }, delayMs)
  }
  const scannerLoop = async () => {
    if (!loopActive)
      return
    const sequence = startSequence
    const startedAt = performance.now()
    const frameRate = Math.min(Math.max(streamFrameRate.value || maxDetectionFrameRate, 1), maxDetectionFrameRate)
    const frameDuration = 1000 / frameRate
    try {
      if (needsRestart.value) {
        needsRestart.value = false
        await restartStream()
        if (sequence !== startSequence)
          return
      }
      if (!isStreaming.value || !isDetectorReady.value || isBusy.value)
        return
      const videoFrame = await getDetectionFrame(detectionMaxSize)
      if (!videoFrame)
        return
      if (sequence !== startSequence) {
        videoFrame.close()
        return
      }
      const frame = { width: video.value!.videoWidth, height: video.value!.videoHeight }
      const result = await inferCorners(videoFrame, { scaleX: frame.width / videoFrame.width, scaleY: frame.height / videoFrame.height })
      if (sequence !== startSequence)
        return
      const warnings: QualityAssessment['warnings'] = []
      if (!currentCorners.value)
        warnings.push('corners-missing')
      if (result.brightness < 40)
        warnings.push('too-dark')
      if (trackingHint.value === 'tilted')
        warnings.push('tilted')
      if (trackingHint.value === 'too-close')
        warnings.push('too-close')
      currentQuality.value = {
        quadConfidence: currentConfidence.value,
        coverage: currentCorners.value ? calculateQuadArea(currentCorners.value) / (frame.width * frame.height) : 0,
        sharpness: result.sharpness, exposure: result.brightness / 255, glare: 0, motion: 0,
        acceptableForAutoCapture: warnings.length === 0, warnings,
      }
    }
    catch (cause) {
      if (sequence === startSequence) {
        lastError.value = scannerError('camera-interrupted', errorMessage(cause, 'Camera stream was interrupted.'), cause)
      }
    }
    finally {
      if (loopActive && sequence === startSequence) {
        scheduleScannerLoop(Math.max(0, (currentCorners.value ? frameDuration : 250) - (performance.now() - startedAt)))
      }
    }
  }
  const animationLoop = () => {
    if (!loopActive)
      return
    if (video.value && overlay.value && isStreaming.value) {
      drawOverlay({
        canvas: overlay.value,
        video: video.value,
        corners: currentCorners.value,
      })
    }
    if (captureRequested.value && !isBusy.value) {
      void performCapture()
    }
    else if (isBusy.value || !isDetectorReady.value) {
      reset(false)
    }
    else {
      if (shouldCapture.value && performance.now() >= nextCaptureAt) {
        captureRequested.value = true
        reset(false)
      }
    }
    overlayFrame = requestAnimationFrame(animationLoop)
  }
  const startScanner = async () => {
    if (isStarting.value || isStarted.value)
      return
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
      if (!currentDocument.value)
        createNewDocument()
      state.value = 'camera-ready'
      loopActive = true
      scheduleScannerLoop()
      animationLoop()
      if (currentDocument.value?.pages.length)
        requireFreshTarget(true)
      else
        startCooldown(600)
      state.value = 'detector-loading'
      try {
        await initializeDetection()
        if (sequence !== startSequence)
          return
        state.value = 'live'
      }
      catch (cause) {
        if (sequence !== startSequence)
          return
        lastError.value = scannerError('detector-load', 'Automatic edge detection is unavailable. Manual capture still works.', cause)
        state.value = 'live'
      }
    }
    catch (cause) {
      if (sequence !== startSequence)
        return
      const code = cameraErrorCode(cause)
      lastError.value = scannerError(code, cameraErrorMessage(code), cause, code !== 'insecure-context')
      state.value = 'error'
      loopActive = false
      clearTimers()
      stopStream()
    }
    finally {
      if (sequence === startSequence)
        isStarting.value = false
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
  }
  const disposeScanner = () => {
    stopScanner()
    processing.dispose()
    for (const page of currentDocument.value?.pages || []) {
      processing.revokePageUrls(page)
    }
    if (deletedPage.value)
      processing.revokePageUrls(deletedPage.value.page)
    deletedPage.value = undefined
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
    }
    catch (cause) {
      lastError.value = scannerError('detector-load', 'Automatic edge detection is unavailable. Manual capture still works.', cause)
      state.value = 'live'
    }
  }
  const removePage = (pageIndex: number) => {
    if (!currentDocument.value)
      return
    const page = currentDocument.value.pages[pageIndex]
    if (!page)
      return
    if (deletedPage.value)
      processing.revokePageUrls(deletedPage.value.page)
    currentDocument.value.pages.splice(pageIndex, 1)
    deletedPage.value = { page, index: pageIndex }
    currentDocument.value.updatedAt = Date.now()
  }
  const canUndoDelete = computed(() => Boolean(deletedPage.value))
  const undoRemovePage = () => {
    if (!currentDocument.value || !deletedPage.value || currentDocument.value.pages.length >= 20)
      return false
    currentDocument.value.pages.splice(Math.min(deletedPage.value.index, currentDocument.value.pages.length), 0, deletedPage.value.page)
    deletedPage.value = undefined
    currentDocument.value.updatedAt = Date.now()
    return true
  }
  const reprocessPage = async (pageIndex: number, changes: {
    profile?: DocumentProcessingProfile;
    rotation?: 0 | 90 | 180 | 270;
    quad?: number[];
  }) => {
    const document = currentDocument.value
    const page = document?.pages[pageIndex]
    if (!document || !page || isBusy.value)
      return false
    isProcessingCapture.value = true
    captureState.value = 'processing'
    captureError.value = undefined
    try {
      const replacement = await processing.replacePage(page, changes)
      assertPageBudget(replacement, pageIndex)
      if (document !== currentDocument.value || document.pages[pageIndex] !== page) {
        processing.revokePageUrls(replacement)
        return false
      }
      document.pages.splice(pageIndex, 1, replacement)
      processing.revokePageUrls(page)
      document.updatedAt = Date.now()
      captureState.value = 'success'
      return true
    }
    catch (cause) {
      captureError.value = scannerError('processing-failed', errorMessage(cause, 'Page processing failed.'), cause)
      captureState.value = 'error'
      return false
    }
    finally {
      isProcessingCapture.value = false
    }
  }
  const rotatePage = (pageIndex: number) => {
    const page = currentDocument.value?.pages[pageIndex]
    if (!page)
      return Promise.resolve(false)
    const rotation = ((page.rotation + 90) % 360) as 0 | 90 | 180 | 270
    return reprocessPage(pageIndex, { rotation })
  }
  const updatePageProfile = (pageIndex: number, profile: DocumentProcessingProfile) => reprocessPage(pageIndex, { profile })
  const updatePageQuad = (pageIndex: number, quad: number[]) => reprocessPage(pageIndex, { quad })
  const reorderPage = (from: number, to: number) => {
    const pages = currentDocument.value?.pages
    if (!pages || from === to || from < 0 || to < 0 || from >= pages.length || to >= pages.length) {
      return false
    }
    const [page] = pages.splice(from, 1)
    if (!page)
      return false
    pages.splice(to, 0, page)
    currentDocument.value!.updatedAt = Date.now()
    return true
  }
  const requestRetakePage = (pageIndex: number) => {
    if (!currentDocument.value?.pages[pageIndex])
      return false
    replacementPageIndex = pageIndex
    return true
  }
  const cancelRetakePage = () => {
    replacementPageIndex = undefined
  }
  return {
    track,
    tracks,
    selectedDeviceId,
    cameraState,
    cameraSettings,
    cameraCapabilities,
    torchOn, torchSupported, setTorch, focusAt, autoCaptureEnabled, setAutoCapture,
    selectTrack,
    isStarting,
    isStarted,
    isDetectorReady,
    isBusy,
    isSwitchingCamera,
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
    importPage,
    createNewDocument,
    removePage,
    undoRemovePage,
    canUndoDelete,
    rotatePage,
    updatePageProfile,
    updatePageQuad,
    reorderPage,
    requestRetakePage,
    cancelRetakePage,
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
