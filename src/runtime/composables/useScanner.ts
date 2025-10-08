import { onMounted, watch } from 'vue'
import type { DocumentScannerOptions } from '../types'
import { useStream } from './useStream'
import { useCornerDetection } from './useCornerDetection'
import { draw } from '../utils/overlay'

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
    scalingFactors,
    containerSize,
  } = useStream({
    video,
    ...videoOptions,
  })

  watch(
    () => containerSize.value,
    (containerSize) => {
      if (!overlay.value) return
      overlay.value.width = containerSize.width
      overlay.value.height = containerSize.height
      // also transform the overlay canvas to the container size
      overlay.value.style.transform = `scale(${scalingFactors.value.width}, ${scalingFactors.value.height})`
      overlay.value.style.transformOrigin = 'top left'
      overlay.value.style.width = `${containerSize.width}px`
      overlay.value.style.height = `${containerSize.height}px`
    },
  )

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
      draw(overlay.value!, corners, scalingFactors.value)
      requestAnimationFrame(loop)
    }
    loop()
  })

  return {}
}
