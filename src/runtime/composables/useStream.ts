import { onUnmounted, ref, shallowRef, watch } from 'vue'
import type { DocumentScannerVideoOptions } from '../types'

export const useStream = (opts: DocumentScannerVideoOptions) => {
  const { facingMode, video, resolution } = opts
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

  const A4 = 210 / 297
  const startStream = async () => {
    if (!video.value) return
    needsRestart.value = false

    const constraints = {
      video: {
        facingMode,
        height: { ideal: resolution },
        width: { ideal: resolution * A4 },
      },
      audio: false,
    } satisfies MediaStreamConstraints

    const s = await navigator.mediaDevices.getUserMedia(constraints)
    stream.value = s

    track.value = s.getVideoTracks()[0]
    tracks.value = s.getVideoTracks()

    const settings = track.value?.getSettings()
    const needRotation = (settings?.height || 0) < (settings?.width || 0)
    if (needRotation) {
      const rotatedHeight = needRotation ? settings?.width : settings?.height
      const rotatedWidth = needRotation ? settings?.height : settings?.width
      await track.value?.applyConstraints({
        height: { ideal: rotatedHeight },
        width: { ideal: rotatedWidth },
      })
    }
    streamFrameRate.value = settings?.frameRate || 0

    video.value.srcObject = s
    await video.value?.play()

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

  onUnmounted(() => {
    stopStream()
  })

  return {
    restartStream,
    startStream,
    stopStream,
    getFrame,
    stream,
    streamFrameRate,
    track,
    tracks,
    isStreaming,
    needsRestart,
  }
}
