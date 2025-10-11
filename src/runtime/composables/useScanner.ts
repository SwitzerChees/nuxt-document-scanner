import { onMounted, ref } from 'vue'
import type { DocumentScannerOptions } from '../types'
import { useStream } from './useStream'
import { useCornerDetection } from './useCornerDetection'
import { useAutoCapture } from './useAutoCapture'

export function useScanner(opts: DocumentScannerOptions) {
  const captureRequested = ref(false)

  const { video, videoOptions, overlay, capture: captureOptions } = opts
  const { opencvUrl, worker: workerOptions } = opts

  const stream = useStream({
    video,
    ...videoOptions,
  })
  const { needsRestart, restartStream, startStream, track, tracks } = stream
  const { getFrame, streamFrameRate, getPhoto } = stream

  const { isInitialized, inferCorners, isStable } = useCornerDetection({
    opencvUrl,
    overlay,
    video,
    worker: workerOptions,
    capture: captureOptions,
  })

  const { canAutoCapture, cancelAutoCapture, progress } = useAutoCapture(
    captureOptions.autoCapture,
  )

  const scannerLoop = async () => {
    if (!video.value) return
    if (!overlay.value) return
    if (!isInitialized.value) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      return requestAnimationFrame(scannerLoop)
    }
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
      console.log('Auto capture can be triggered')
      captureRequested.value = true
      cancelAutoCapture(true)
    } else if (!isStable.value) {
      cancelAutoCapture(false)
    }

    // 4. If captureRequested is true, capture photo
    if (captureRequested.value) {
      console.log('Capturing photo')
      const start = performance.now()
      await getPhoto()
      const end = performance.now()
      console.log(`Photo captured in ${end - start}ms`)
      captureRequested.value = false
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

  onMounted(async () => {
    await startStream()
    scannerLoop()
  })

  return {
    track,
    tracks,
    isStable,
    autoCaptureProgress: progress,
    captureRequested,
  }
}
