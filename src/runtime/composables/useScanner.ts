import { onMounted, watch, type Ref } from 'vue'
import type { DocumentScannerOptions } from '../types'
import { useVideo } from './useVideo'

export function useScanner(
  video: Ref<HTMLVideoElement | undefined>,
  opts: DocumentScannerOptions,
) {
  const { videoOptions } = opts
  const { streamSize, containerSize, startVideo } = useVideo(
    video,
    videoOptions,
  )

  watch(
    () => streamSize,
    (streamSize) => {
      console.log('streamSize, ', streamSize)
    },
  )
  watch(
    () => containerSize,
    (containerSize) => {
      console.log('containerSize, ', containerSize)
    },
  )
  onMounted(() => {
    setTimeout(() => {
      startVideo()
    }, 1000)
  })

  return {}
}
