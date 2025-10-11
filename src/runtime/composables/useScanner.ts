import { computed, ref } from 'vue'
import type { Document, DocumentScannerOptions } from '../types'
import { useStream } from './useStream'
import { useCornerDetection } from './useCornerDetection'
import { useAutoCapture } from './useAutoCapture'
import {
  copyImageData,
  cropByCorners,
  getThumbnail,
} from '../utils/image-postprocessing'

export function useScanner(opts: DocumentScannerOptions) {
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

  const startScanner = async () => {
    isStarting.value = true
    await Promise.all([startStream(), initializeWorker()])
    currentDocument.value = {
      id: '1',
      type: 'image',
      format: 'jpg',
      pages: [],
    }
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

    // 3. Update auto-capture progress every frame
    updateProgress(isStable.value)

    // 4. Check if autoCapture can be triggered
    if (canAutoCapture()) {
      captureRequested.value = true
      reset(true)
    }

    // 5. If captureRequested is true, capture photo
    if (captureRequested.value) {
      captureRequested.value = false
      const finalFrame = await getFrame()
      if (!finalFrame) return
      await inferCorners(copyImageData(finalFrame))
      const cropped = cropByCorners(finalFrame, currentCorners.value!)
      if (!cropped) return
      const thumbnail = getThumbnail(cropped)
      currentDocument.value?.pages.push({
        id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: 'image',
        format: 'jpg',
        original: videoFrame,
        processed: cropped,
        quad: currentCorners.value!,
        timestamp: Date.now(),
        thumbnail,
      })
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
    autoCaptureDelay: delay,
    captureRequested,
  }
}
