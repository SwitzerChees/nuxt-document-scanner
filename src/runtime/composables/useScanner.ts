import { onMounted, watch, type Ref } from 'vue'
import type { DocumentScannerOptions } from '../types'
import { useVideo } from './useVideo'

export function useScanner(
  video: Ref<HTMLVideoElement | undefined>,
  opts: DocumentScannerOptions,
) {
  const { videoOptions } = opts
  const { streamSize, containerSize, startVideo, needsRestart } = useVideo(
    video,
    videoOptions,
  )

  watch(
    () => streamSize.value,
    (streamSize) => {
      console.log('streamSize, ', streamSize)
    },
  )
  watch(
    () => containerSize.value,
    (containerSize) => {
      console.log('containerSize, ', containerSize)
    },
  )
  watch(
    () => needsRestart.value,
    (needsRestart) => {
      console.log('needsRestart, ', needsRestart)
    },
  )
  onMounted(() => {
    setTimeout(() => {
      startVideo()
    }, 1000)
  })

  return {}
}
