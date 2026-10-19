import { afterEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { DocumentPage, DocumentScannerOptions } from '../src/runtime/types'
import { useDocumentScanner } from '../src/runtime/composables/useDocumentScanner'

const mocks = vi.hoisted(() => ({ stream: {} as any, detection: {} as any, processing: {} as any }))
vi.mock('../src/runtime/composables/useStream', () => ({ useStream: () => mocks.stream }))
vi.mock('../src/runtime/composables/useCornerDetection', () => ({ useCornerDetection: () => mocks.detection }))
vi.mock('../src/runtime/composables/usePostprocessing', () => ({ usePostprocessing: () => mocks.processing }))

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it.each([true, false])('defers camera recovery until capture finishes (still muted: %s)', async (stillMuted) => {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 16))
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  let finishBurst!: (frames: ImageBitmap[]) => void
  let finishProcessing!: (page: DocumentPage) => void
  const burst = new Promise<ImageBitmap[]>(resolve => {
    finishBurst = resolve
  })
  const processed = new Promise<DocumentPage>(resolve => {
    finishProcessing = resolve
  })
  mocks.stream = {
    isStreaming: ref(false), isSwitchingCamera: ref(false), needsRestart: ref(false),
    track: ref({ readyState: 'live', muted: false }), streamFrameRate: ref(30), cameraState: ref('playing'),
    startStream: vi.fn(async () => { mocks.stream.isStreaming.value = true }),
    stopStream: vi.fn(() => { mocks.stream.isStreaming.value = false }),
    restartStream: vi.fn(async () => { mocks.stream.needsRestart.value = false }),
    captureBurst: vi.fn(() => burst), captureStill: vi.fn(async () => undefined),
    getDetectionFrame: vi.fn(async () => undefined),
  }
  mocks.detection = {
    isInitialized: ref(true), currentCorners: ref(undefined), currentConfidence: ref(0),
    progress: ref(0), shouldCapture: ref(false), hint: ref('align'),
    setAutoCapture: vi.fn(), resetTracking: vi.fn(), initializeDetection: vi.fn(), disposeWorker: vi.fn(),
    waitForInferenceIdle: vi.fn(), markCaptured: vi.fn(() => { mocks.detection.shouldCapture.value = false }),
  }
  mocks.processing = { process: vi.fn(() => processed), dispose: vi.fn(), revokePageUrls: vi.fn() }
  const scanner = useDocumentScanner({
    overlay: ref(undefined), videoOptions: { video: ref({ videoWidth: 640, videoHeight: 480 } as HTMLVideoElement) },
    worker: { detectionMaxSize: 256 }, capture: { stableDuration: 500, autoCapture: { enabled: true, delay: 500, cooldown: 1000 } },
  } as DocumentScannerOptions)
  try {
    await scanner.startScanner()
    mocks.detection.shouldCapture.value = true
    await vi.advanceTimersByTimeAsync(48)
    expect(mocks.stream.captureBurst).toHaveBeenCalledOnce()
    mocks.stream.track.value.muted = true
    mocks.stream.cameraState.value = 'interrupted'
    mocks.stream.needsRestart.value = true
    await vi.advanceTimersByTimeAsync(300)
    expect(mocks.stream.restartStream).not.toHaveBeenCalled()
    finishBurst([{ width: 640, height: 480, close: vi.fn() } as unknown as ImageBitmap])
    await vi.advanceTimersByTimeAsync(300)
    expect(mocks.processing.process).toHaveBeenCalledOnce()
    expect(mocks.stream.restartStream).not.toHaveBeenCalled()
    mocks.stream.track.value.muted = stillMuted
    const image = new Blob(['page'])
    finishProcessing({ id: 'captured', processed: image, thumbnail: image } as DocumentPage)
    await vi.advanceTimersByTimeAsync(300)
    expect(scanner.currentDocument.value?.pages.map(page => page.id)).toEqual(['captured'])
    expect(scanner.captureError.value).toBeUndefined()
    expect(mocks.stream.restartStream).toHaveBeenCalledTimes(stillMuted ? 1 : 0)
    expect(mocks.stream.needsRestart.value).toBe(false)
    if (!stillMuted)
      expect(mocks.stream.cameraState.value).toBe('playing')
  }
  finally {
    scanner.disposeScanner()
  }
})
