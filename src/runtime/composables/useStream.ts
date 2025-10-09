import { onUnmounted, ref, shallowRef, watch } from 'vue'
import { useResizeObserver } from './useResizeObserver'
import type { DocumentScannerVideoOptions } from '../types'

export const useStream = (opts: DocumentScannerVideoOptions) => {
  const { resizeDelay, facingMode, video } = opts
  const stream = shallowRef<MediaStream>()
  const track = shallowRef<MediaStreamTrack>()
  const tracks = shallowRef<MediaStreamTrack[]>()
  const streamFrameRate = ref<number>(0)
  const isStreaming = ref(false)
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

  const getVideoFrame = async () => {
    if (!video.value) return
    const canvas = document.createElement('canvas')
    canvas.width = video.value.videoWidth
    canvas.height = video.value.videoHeight

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx?.drawImage(video.value, 0, 0, canvas.width, canvas.height)
    return ctx?.getImageData(0, 0, canvas.width, canvas.height)
  }

  const startVideo = async () => {
    if (!video.value) return
    needsRestart.value = false

    const constraints = {
      video: {
        facingMode,
      },
      audio: false,
    } satisfies MediaStreamConstraints
    console.log('constraints', constraints)

    const s = await navigator.mediaDevices.getUserMedia(constraints)
    stream.value = s
    video.value.srcObject = s
    await video.value?.play()

    track.value = s.getVideoTracks()[0]
    tracks.value = s.getVideoTracks()

    // get track infos like fps
    const settings = track.value?.getSettings()
    streamFrameRate.value = settings?.frameRate || 0
    if (!track.value) return

    isStreaming.value = true
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
    streamFrameRate,
    tracks,
    isStreaming,
    needsRestart,
    getVideoFrame,
  }
}
