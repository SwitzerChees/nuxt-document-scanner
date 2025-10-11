import { computed, ref } from 'vue'
import type { Document, DocumentScannerOptions } from '../types'
import { useStream } from './useStream'
import { useCornerDetection } from './useCornerDetection'
import { useAutoCapture } from './useAutoCapture'

export function useScanner(opts: DocumentScannerOptions) {
  const captureRequested = ref(false)
  const currentDocument = ref<Document | undefined>(undefined)

  const { video, videoOptions, overlay, capture: captureOptions } = opts
  const { opencvUrl, worker: workerOptions } = opts

  const stream = useStream({
    video,
    ...videoOptions,
  })
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

  const { isInitialized, inferCorners, isStable, initializeWorker } =
    useCornerDetection({
      opencvUrl,
      overlay,
      video,
      worker: workerOptions,
      capture: captureOptions,
    })

  const { canAutoCapture, cancelAutoCapture, progress } = useAutoCapture(
    captureOptions.autoCapture,
  )

  const isStarting = ref(false)
  const isStarted = computed(() => isInitialized.value && isStreaming.value)

  const startScanner = async () => {
    isStarting.value = true
    await startStream()
    await initializeWorker()
    isStarting.value = false
    scannerLoop()
  }

  const stopScanner = () => {
    stopStream()
  }

  const scannerLoop = async () => {
    if (!video.value) return
    if (!overlay.value) return
    if (!isStarted.value) return

    const timePerFrame = 1000 / streamFrameRate.value
    const startTime = performance.now()
    // Restart video if needed for example when track is changed
    if (needsRestart.value) {
      await restartStream()
      needsRestart.value = false
    }
    // 1. Get video frame from stream
    const videoFrame = await getFrame()
    if (!videoFrame) return
    // 2. Make corner detection & Draw detectedcorners on overlay
    await inferCorners(videoFrame)

    // 3. Check if autoCapture can be triggered if so set captureRequested to true
    if (canAutoCapture(isStable.value)) {
      captureRequested.value = true
      cancelAutoCapture(true)
    } else if (!isStable.value) {
      cancelAutoCapture(false)
    }

    // 4. If captureRequested is true, capture photo
    if (captureRequested.value) {
      captureRequested.value = false
      console.log('Capturing photo', videoFrame.height, videoFrame.width)
    }

    const endTime = performance.now()
    const timeTaken = endTime - startTime
    if (timeTaken < timePerFrame) {
      await new Promise((resolve) =>
        setTimeout(resolve, timePerFrame - timeTaken),
      )
    }

    requestAnimationFrame(scannerLoop)
  }

  return {
    track,
    tracks,
    isStarting,
    isStarted,
    startScanner,
    stopScanner,
    isStable,
    currentDocument,
    autoCaptureProgress: progress,
    captureRequested,
  }
}
