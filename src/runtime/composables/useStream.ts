import { onUnmounted, ref, shallowRef, watch } from 'vue'
import { useResizeObserver } from './useResizeObserver'
import type { DocumentScannerVideoOptions } from '../types'

export const useStream = (opts: DocumentScannerVideoOptions) => {
  const { resizeDelay, facingMode, video } = opts
  const stream = shallowRef<MediaStream>()
  const track = shallowRef<MediaStreamTrack>()
  const isStreaming = ref(false)
  const streamSize = ref({ width: 0, height: 0 })
  const containerSize = ref({ width: 0, height: 0 })
  const { isResizing } = useResizeObserver(video, resizeDelay)
  const needsRestart = ref(false)

  watch(
    () => isResizing.value,
    (newIsResizing) => {
      if (newIsResizing && isStreaming.value) return
      needsRestart.value = true
    },
  )

  const takePhoto = async () => {
    if (!track.value) return
    const imageCapture = new ImageCapture(track.value)
    const photoCapabilities = await imageCapture.getPhotoCapabilities()

    const hasFlash = photoCapabilities.fillLightMode?.includes('flash')
    const fillLightMode = hasFlash ? 'flash' : undefined
    const imageHeight = photoCapabilities.imageHeight?.max
    const imageWidth = photoCapabilities.imageWidth?.max

    const blob = await imageCapture.takePhoto({
      fillLightMode,
      imageHeight,
      imageWidth,
    })
    return blob
  }

  const startVideo = async () => {
    if (!video.value) return
    needsRestart.value = false

    const container = video.value?.parentElement
    if (!container) return
    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight

    containerSize.value = { width: containerWidth, height: containerHeight }

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

    track.value = s.getVideoTracks()[0]
    if (!track.value) return
    const settings = track.value.getSettings()

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

  const restartVideo = async () => {
    stopVideo()
    await startVideo()
  }

  return {
    restartVideo,
    startVideo,
    stopVideo,
    takePhoto,
    stream,
    isStreaming,
    streamSize,
    containerSize,
    needsRestart,
  }
}
