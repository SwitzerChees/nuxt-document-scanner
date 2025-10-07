import { onUnmounted, ref, shallowRef, type Ref } from 'vue'
import { useResizeObserver } from './useResizeObserver'

type UseVideoOptions = {
  resizeDelay: number
  facingMode: 'environment' | 'user'
}

export const useVideo = (
  video: Ref<HTMLVideoElement | undefined>,
  opts: UseVideoOptions,
) => {
  const { resizeDelay, facingMode } = opts
  const stream = shallowRef<MediaStream>()
  const isStreaming = ref(false)
  const streamSize = ref({ width: 0, height: 0 })

  const { size: containerSize, isResizing } = useResizeObserver(
    video,
    resizeDelay,
  )

  const startVideo = async () => {
    if (!video.value) return

    const container = video.value?.parentElement
    if (!container) return
    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight

    const constraints = {
      video: {
        facingMode,
        width: containerWidth,
        height: containerHeight,
      },
      audio: false,
    } satisfies MediaStreamConstraints

    const s = await navigator.mediaDevices.getUserMedia(constraints)
    stream.value = s
    video.value.srcObject = s
    await video.value?.play()

    const track = s.getVideoTracks()[0]
    const settings = track?.getSettings()

    isStreaming.value = true

    streamSize.value = {
      width: settings?.width || 0,
      height: settings?.height || 0,
    }
  }

  const stopVideo = () => {
    if (!stream.value) return
    stream.value.getTracks().forEach((t: MediaStreamTrack) => t.stop())
    isStreaming.value = false
  }
  onUnmounted(() => {
    stopVideo()
  })

  return {
    startVideo,
    stopVideo,
    stream,
    isStreaming,
    streamSize,
    containerSize,
    isResizing,
  }
}
