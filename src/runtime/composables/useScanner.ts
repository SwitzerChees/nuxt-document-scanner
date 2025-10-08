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
  const {
    needsRestart,
    restartVideo,
    startVideo,
    getVideoFrame,
    streamSize,
    containerSize,
  } = useStream({
    video,
    ...videoOptions,
  })

  const { isInitialized, inferCorners } = useCornerDetection({
    overlay,
    opencvUrl,
    worker: workerOptions,
  })

  onMounted(async () => {
    await startVideo()
    await new Promise((resolve) => setTimeout(resolve, 4000))
    const loop = async () => {
      if (!video.value) return
      if (!isInitialized.value) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        return requestAnimationFrame(loop)
      }
      // Restart video if needed
      if (needsRestart.value) {
        await restartVideo()
      }
      // 1. Get video frame from stream
      const rgba = await getVideoFrame()
      if (!rgba) return
      // 2. Send to corner detection worker & Receive result
      const corners = await inferCorners(rgba)
      // 3. Draw result on overlay
      drawOverlay({
        canvas: overlay.value!,
        containerSize: containerSize.value,
        streamSize: streamSize.value,
        corners,
      })
      requestAnimationFrame(loop)
    }
    loop()
  })

  return {}
}
