import { onMounted, watch } from 'vue'
import type { DocumentScannerOptions } from '../types'
import { useStream } from './useStream'
import { useCornerDetection } from './useCornerDetection'

export function useScanner(opts: DocumentScannerOptions) {
  const { video, videoOptions, overlay, opencvUrl } = opts
  const {
    streamSize,
    containerSize,
    needsRestart,
    restartVideo,
    startVideo,
    takePhoto,
    getVideoFrame,
  } = useStream({ video, ...videoOptions })

  useCornerDetection({ overlay, opencvUrl })

  onMounted(async () => {
    await startVideo()
    await new Promise((resolve) => setTimeout(resolve, 4000))
    const loop = async () => {
      if (!video.value) return
      // Restart video if needed
      if (needsRestart.value) {
        await restartVideo()
      }
      // 1. Get video frame from stream
      await getVideoFrame()
      // 2. Send to corner detection worker & Receive result
      // 3. Draw result on overlay
      requestAnimationFrame(loop)
    }
    loop()
  })

  //   watch(
  //     () => streamSize.value,
  //     (streamSize) => {
  //       console.log('streamSize, ', streamSize)
  //     },
  //   )
  //   watch(
  //     () => containerSize.value,
  //     (containerSize) => {
  //       console.log('containerSize, ', containerSize)
  //     },
  //   )
  //   watch(
  //     () => needsRestart.value,
  //     (needsRestart) => {
  //       console.log('needsRestart, ', needsRestart)
  //     },
  //   )
  //   onMounted(() => {
  //     setTimeout(() => {
  //       startVideo()
  //       setTimeout(async () => {
  //         const blob = await takePhoto()
  //         console.log('blob, ', blob)
  //       }, 1000)
  //     }, 1000)
  //   })

  return {}
}
