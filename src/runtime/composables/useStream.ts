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

const isIOSWebKit = () => {
  const ua = navigator.userAgent || ''
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

const A4 = 210 / 297
const IOS_MAX_RESOLUTION = 1280

export const resolvePreferredVideoSize = (
  resolution: number,
  isIOS: boolean,
) => {
  const safeResolution = Math.max(
    640,
    Math.round(isIOS ? Math.min(resolution, IOS_MAX_RESOLUTION) : resolution),
  )

  return isIOS
    ? { width: safeResolution, height: Math.round(safeResolution * A4) }
    : { width: Math.round(safeResolution * A4), height: safeResolution }
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

    const isIOS = isIOSWebKit()
    const { width, height } = resolvePreferredVideoSize(resolution, isIOS)

    const videoConstraints: MediaTrackConstraints = {
      height: { ideal: height },
      width: { ideal: width },
      aspectRatio: { ideal: A4 },
    }
    const supportedConstraints =
      navigator.mediaDevices.getSupportedConstraints?.()
    if (
      (supportedConstraints as MediaTrackSupportedConstraints & {
        resizeMode?: boolean
      })?.resizeMode
    ) {
      ;(
        videoConstraints as MediaTrackConstraints & {
          resizeMode?: { ideal: string }
        }
      ).resizeMode = { ideal: 'none' }
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

  const getCanvasContext = () => {
    if (!canvas) {
      canvas = document.createElement('canvas')
      ctx = canvas.getContext('2d', { willReadFrequently: true })
    }
    return { canvas, ctx }
  }

  const imageSourceToFrame = (
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
    maxSize: number | undefined,
    coordinateWidth: number,
    coordinateHeight: number,
  ): CapturedFrame | undefined => {
    const drawing = getCanvasContext()
    if (!drawing.ctx) return

    const scale =
      maxSize && Math.max(sourceWidth, sourceHeight) > maxSize
        ? maxSize / Math.max(sourceWidth, sourceHeight)
        : 1
    const outputWidth = Math.max(1, Math.round(sourceWidth * scale))
    const outputHeight = Math.max(1, Math.round(sourceHeight * scale))
    if (
      drawing.canvas.width !== outputWidth ||
      drawing.canvas.height !== outputHeight
    ) {
      drawing.canvas.width = outputWidth
      drawing.canvas.height = outputHeight
    }

    drawing.ctx.drawImage(source, 0, 0, outputWidth, outputHeight)
    const imageData = drawing.ctx.getImageData(0, 0, outputWidth, outputHeight)
    return {
      imageData,
      scaleX: coordinateWidth / outputWidth,
      scaleY: coordinateHeight / outputHeight,
    }
  }

  const getFrame = (maxSize?: number): CapturedFrame | undefined => {
    if (!video.value) return

    const w = video.value.videoWidth
    const h = video.value.videoHeight
    if (!w || !h) return

    return imageSourceToFrame(video.value, w, h, maxSize, w, h)
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
