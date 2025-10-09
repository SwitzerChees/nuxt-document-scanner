import { onMounted } from 'vue'
import type { DocumentScannerOptions } from '../types'
import { useStream } from './useStream'
import { useCornerDetection } from './useCornerDetection'
import { drawOverlay } from '../utils/overlay'

export function useScanner(opts: DocumentScannerOptions) {
  const { video, videoOptions, overlay } = opts
  const { opencvUrl, worker: workerOptions } = opts

  const stream = useStream({
    video,
    ...videoOptions,
  })
  const { needsRestart, restartVideo, startVideo, track, tracks } = stream
  const { getVideoFrame, streamFrameRate } = stream

  const { isInitialized, inferCorners } = useCornerDetection({
    opencvUrl,
    overlay,
    video,
    worker: workerOptions,
  })

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
      await restartVideo()
      needsRestart.value = false
    }
    // 1. Get video frame from stream
    const rgba = await getVideoFrame()
    if (!rgba) return
    // 2. Make corner detection & Draw detectedcorners on overlay
    await inferCorners(rgba)

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
    await startVideo()
    scannerLoop()
  })

  return { track, tracks }
}
