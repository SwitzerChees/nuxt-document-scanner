import { onUnmounted, ref, shallowRef, watch } from 'vue'
import type { DocumentScannerVideoOptions } from '../types'

export const useStream = (opts: DocumentScannerVideoOptions) => {
  const { facingMode, video, resolution } = opts
  const stream = shallowRef<MediaStream>()
  const track = shallowRef<MediaStreamTrack>()
  const tracks = shallowRef<MediaStreamTrack[]>()
  const streamFrameRate = ref(0)
  const isStreaming = ref(false)
  const needsRestart = ref(false)

  const A4 = 210 / 297
  let canvas: HTMLCanvasElement | undefined
  let ctx: CanvasRenderingContext2D | null = null

  watch(track, (newTrack, oldTrack) => {
    if (!newTrack || newTrack.id === oldTrack?.id) return
    if (isStreaming.value) needsRestart.value = true
  })

  const startStream = async () => {
    if (!video.value) return
    needsRestart.value = false

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const height = isIOS ? resolution * A4 : resolution
    const width = isIOS ? resolution : resolution * A4

    const constraints: MediaStreamConstraints = {
      video: {
        facingMode,
        height: { ideal: height },
        width: { ideal: width },
        aspectRatio: { exact: A4 },
      },
      audio: false,
    }

    const s = await navigator.mediaDevices.getUserMedia(constraints)
    const tracksList = s.getVideoTracks()
    stream.value = s
    track.value = tracksList[0]
    tracks.value = tracksList

    const settings = track.value?.getSettings()
    streamFrameRate.value = settings?.frameRate || 30

    video.value.srcObject = s
    await video.value.play().catch(() => {})

    isStreaming.value = true
  }

  const stopStream = () => {
    if (!stream.value) return
    for (const t of stream.value.getTracks()) t.stop()
    isStreaming.value = false
  }

  const restartStream = async () => {
    stopStream()
    await startStream()
  }

  const getFrame = () => {
    if (!video.value) return
    if (!canvas) {
      canvas = document.createElement('canvas')
      ctx = canvas.getContext('2d', { willReadFrequently: true })
    }

    const w = video.value.videoWidth
    const h = video.value.videoHeight
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }

    ctx?.drawImage(video.value, 0, 0, w, h)
    return ctx?.getImageData(0, 0, w, h)
  }

  onUnmounted(stopStream)

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
