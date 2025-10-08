import { onMounted, watch } from 'vue'
import type { DocumentScannerOptions } from '../types'
import { useStream } from './useStream'

export function useScanner(opts: DocumentScannerOptions) {
  const { video, videoOptions } = opts
  const {
    streamSize,
    containerSize,
    needsRestart,
    startVideo,
    takePhoto,
    getVideoFrame,
  } = useStream({ video, ...videoOptions })

  onMounted(async () => {
    await startVideo()
    await new Promise((resolve) => setTimeout(resolve, 4000))
    const loop = async () => {
      if (!video.value) return
      const start = performance.now()
      await getVideoFrame()
      const end = performance.now()
      console.log('time, ', end - start)
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
