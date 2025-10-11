import { onUnmounted, ref, shallowRef, watch } from 'vue'
import type { DocumentScannerVideoOptions } from '../types'

export const useStream = (opts: DocumentScannerVideoOptions) => {
  const { facingMode, video } = opts
  const stream = shallowRef<MediaStream>()
  const track = shallowRef<MediaStreamTrack>()
  const tracks = shallowRef<MediaStreamTrack[]>()
  const streamFrameRate = ref<number>(0)
  const isStreaming = ref(false)
  const needsRestart = ref(false)

  watch(
    () => track.value,
    (newTrack) => {
      if (newTrack?.id === track.value?.id) return
      if (!isStreaming.value) return
      needsRestart.value = true
    },
  )

  const startStream = async () => {
    if (!video.value) return
    needsRestart.value = false

    const constraints = {
      video: {
        facingMode,
      },
      audio: false,
    } satisfies MediaStreamConstraints

    const s = await navigator.mediaDevices.getUserMedia(constraints)
    stream.value = s
    track.value = s.getVideoTracks()[0]
    tracks.value = s.getVideoTracks()

    await getPhoto()

    video.value.srcObject = s
    await video.value?.play()

    const settings = track.value?.getSettings()
    streamFrameRate.value = settings?.frameRate || 0
    if (!track.value) return

    isStreaming.value = true
  }

  const stopStream = () => {
    if (!stream.value) return
    stream.value.getTracks().forEach((t: MediaStreamTrack) => t.stop())
    isStreaming.value = false
  }

  const restartStream = async () => {
    stopStream()
    await startStream()
  }

  let ctx: CanvasRenderingContext2D | null = null
  const getFrame = async () => {
    if (!video.value) return
    const canvas = document.createElement('canvas')
    canvas.width = video.value.videoWidth
    canvas.height = video.value.videoHeight

    if (!ctx) {
      ctx = canvas.getContext('2d', { willReadFrequently: true })
    }

    ctx?.drawImage(video.value, 0, 0, canvas.width, canvas.height)
    return ctx?.getImageData(0, 0, canvas.width, canvas.height)
  }

  let imageCapture: ImageCapture | null = null
  const getPhoto = async () => {
    if (!track.value) return
    if (!imageCapture) imageCapture = new ImageCapture(track.value)

    const photoCapabilities = await imageCapture.getPhotoCapabilities()
    const imageHeight = photoCapabilities.imageHeight?.max
    const imageWidth = photoCapabilities.imageWidth?.max
    const blob = await imageCapture.takePhoto({
      imageHeight,
      imageWidth,
    })
    return blob
  }

  onUnmounted(() => {
    stopStream()
  })

  return {
    restartStream,
    startStream,
    stopStream,
    getFrame,
    getPhoto,
    stream,
    streamFrameRate,
    track,
    tracks,
    isStreaming,
    needsRestart,
  }
}
