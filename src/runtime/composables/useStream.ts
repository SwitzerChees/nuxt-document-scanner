import { onUnmounted, ref, shallowRef, watch } from 'vue'
import type {
  DocumentScannerCamera,
  DocumentScannerVideoOptions,
} from '../types'

export type CapturedFrame = {
  imageData: ImageData
  scaleX: number
  scaleY: number
}

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

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const safeResolution = isIOS ? Math.min(resolution, 1280) : resolution
    const height = isIOS ? safeResolution * A4 : safeResolution
    const width = isIOS ? safeResolution : safeResolution * A4

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
    if (stream.value) {
      for (const t of stream.value.getTracks()) t.stop()
    }
    stream.value = undefined
    track.value = undefined
    isStreaming.value = false
    needsRestart.value = false
    if (video.value) {
      video.value.pause()
      video.value.srcObject = null
      video.value.removeAttribute('src')
      video.value.load()
    }
    if (canvas) {
      canvas.width = 1
      canvas.height = 1
    }
  }

  const restartStream = async () => {
    stopStream()
    await startStream()
  }

  const getFrame = (maxSize?: number): CapturedFrame | undefined => {
    if (!video.value) return
    if (!canvas) {
      canvas = document.createElement('canvas')
      ctx = canvas.getContext('2d', { willReadFrequently: true })
    }

    const w = video.value.videoWidth
    const h = video.value.videoHeight
    if (!w || !h) return
    const scale = maxSize && Math.max(w, h) > maxSize ? maxSize / Math.max(w, h) : 1
    const outputWidth = Math.max(1, Math.round(w * scale))
    const outputHeight = Math.max(1, Math.round(h * scale))
    if (canvas.width !== outputWidth || canvas.height !== outputHeight) {
      canvas.width = outputWidth
      canvas.height = outputHeight
    }

    ctx?.drawImage(video.value, 0, 0, outputWidth, outputHeight)
    const imageData = ctx?.getImageData(0, 0, outputWidth, outputHeight)
    if (!imageData) return
    return {
      imageData,
      scaleX: w / outputWidth,
      scaleY: h / outputHeight,
    }
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
