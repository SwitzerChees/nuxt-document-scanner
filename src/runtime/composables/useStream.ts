import { onUnmounted, ref, shallowRef, watch } from 'vue'
import type {
  DocumentScannerCamera,
  DocumentScannerVideoOptions,
} from '../types'

export const useStream = (opts: DocumentScannerVideoOptions) => {
  const { facingMode, video, resolution } = opts
  const stream = shallowRef<MediaStream>()
  const track = shallowRef<MediaStreamTrack>()
  const tracks = shallowRef<DocumentScannerCamera[]>([])
  const selectedDeviceId = ref<string>()
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

  const refreshCameras = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    const devices = await navigator.mediaDevices.enumerateDevices()
    tracks.value = devices
      .filter((device) => device.kind === 'videoinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${index + 1}`,
      }))
  }

  const startStream = async () => {
    if (!video.value) return
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access requires HTTPS or localhost.')
    }
    needsRestart.value = false

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const height = isIOS ? resolution * A4 : resolution
    const width = isIOS ? resolution : resolution * A4

    const videoConstraints: MediaTrackConstraints = {
      height: { ideal: height },
      width: { ideal: width },
      aspectRatio: { ideal: A4 },
    }

    if (selectedDeviceId.value) {
      videoConstraints.deviceId = { exact: selectedDeviceId.value }
    } else {
      videoConstraints.facingMode = { ideal: facingMode }
    }

    const constraints: MediaStreamConstraints = {
      video: videoConstraints,
      audio: false,
    }

    const s = await navigator.mediaDevices.getUserMedia(constraints)
    const tracksList = s.getVideoTracks()
    stream.value = s
    track.value = tracksList[0]

    const settings = track.value?.getSettings()
    selectedDeviceId.value = settings?.deviceId || selectedDeviceId.value
    streamFrameRate.value = settings?.frameRate || 30
    await refreshCameras().catch(() => {})

    video.value.srcObject = s
    isStreaming.value = true
    void video.value.play().catch(() => {})
  }

  const stopStream = () => {
    if (!stream.value) return
    for (const t of stream.value.getTracks()) t.stop()
    stream.value = undefined
    track.value = undefined
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
    if (!w || !h) return
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }

    ctx?.drawImage(video.value, 0, 0, w, h)
    return ctx?.getImageData(0, 0, w, h)
  }

  const selectTrack = (camera: DocumentScannerCamera) => {
    if (!camera.deviceId || camera.deviceId === selectedDeviceId.value) return
    selectedDeviceId.value = camera.deviceId
    if (isStreaming.value) needsRestart.value = true
  }

  onUnmounted(stopStream)

  return {
    restartStream,
    startStream,
    stopStream,
    refreshCameras,
    selectTrack,
    getFrame,
    stream,
    streamFrameRate,
    track,
    tracks,
    isStreaming,
    needsRestart,
  }
}
