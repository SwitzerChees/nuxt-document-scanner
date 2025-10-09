import { onMounted } from 'vue'
import type { DocumentScannerOptions } from '../types'
import { useStream } from './useStream'
import { useCornerDetection } from './useCornerDetection'
import { drawOverlay } from '../utils/overlay'

export function useScanner(opts: DocumentScannerOptions) {
  const {
    video,
    videoOptions,
    overlay,
    opencvUrl,
    worker: workerOptions,
  } = opts
  const { needsRestart, restartVideo, startVideo, getVideoFrame } = useStream({
    video,
    ...videoOptions,
  })

  const { isInitialized, inferCorners } = useCornerDetection({
    opencvUrl,
    worker: workerOptions,
  })

  const scannerLoop = async () => {
    if (!video.value) return
    if (!overlay.value) return
    if (!isInitialized.value) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      return requestAnimationFrame(scannerLoop)
    }
    // Restart video if needed
    // if (needsRestart.value) {
    //   await restartVideo()
    // }
    // 1. Get video frame from stream
    const rgba = await getVideoFrame()
    if (!rgba) return
    // 2. Make corner detection
    const corners = await inferCorners(rgba)
    // 3. Draw detectedcorners on overlay
    drawOverlay({
      canvas: overlay.value,
      video: video.value,
      corners,
    })
    requestAnimationFrame(scannerLoop)
  }

  onMounted(async () => {
    await startVideo()
    scannerLoop()
  })

  return {}
}
