import { onUnmounted, ref, shallowRef, watch } from 'vue'
import type {
  DocumentScannerCamera,
  DocumentScannerVideoOptions,
} from '../types'

export type CapturedFrame = {
  imageData: ImageData
  scaleX: number
  scaleY: number
  isHighResolution?: boolean
}

type HighResolutionCaptureOptions = {
  enabled: boolean
  resolution: number
  settleFrames: number
  timeout: number
}

type VideoSize = {
  width: number
  height: number
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
const MIN_HIGH_RESOLUTION_GAIN = 1.15

const supportsResizeMode = () => {
  const supportedConstraints = navigator.mediaDevices.getSupportedConstraints?.()
  return Boolean(
    (supportedConstraints as MediaTrackSupportedConstraints & {
      resizeMode?: boolean
    })?.resizeMode,
  )
}

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

export const resolveHighResolutionVideoSize = (
  currentWidth: number,
  currentHeight: number,
  targetLongEdge: number,
  capabilities?: MediaTrackCapabilities,
) => {
  if (!currentWidth || !currentHeight) return undefined

  const currentLongEdge = Math.max(currentWidth, currentHeight)
  const requestedLongEdge = Math.max(
    currentLongEdge,
    Math.round(targetLongEdge || currentLongEdge),
  )
  if (requestedLongEdge < currentLongEdge * MIN_HIGH_RESOLUTION_GAIN) {
    return undefined
  }

  const aspectRatio = currentWidth / currentHeight
  let width =
    currentWidth >= currentHeight
      ? requestedLongEdge
      : Math.round(requestedLongEdge * aspectRatio)
  let height =
    currentWidth >= currentHeight
      ? Math.round(requestedLongEdge / aspectRatio)
      : requestedLongEdge

  const widthCapability = capabilities?.width
  const heightCapability = capabilities?.height
  const maxWidth =
    typeof widthCapability === 'object' && 'max' in widthCapability
      ? widthCapability.max
      : undefined
  const maxHeight =
    typeof heightCapability === 'object' && 'max' in heightCapability
      ? heightCapability.max
      : undefined
  const capScale = Math.min(
    maxWidth ? maxWidth / width : 1,
    maxHeight ? maxHeight / height : 1,
    1,
  )
  width = Math.max(1, Math.round(width * capScale))
  height = Math.max(1, Math.round(height * capScale))

  if (Math.max(width, height) < currentLongEdge * MIN_HIGH_RESOLUTION_GAIN) {
    return undefined
  }

  return { width, height }
}

export const useStream = (opts: DocumentScannerVideoOptions) => {
  const { facingMode, video, resolution } = opts
  const highResolutionCapture: HighResolutionCaptureOptions = {
    enabled: Boolean(opts.highResolutionCapture?.enabled),
    resolution: opts.highResolutionCapture?.resolution || 1920,
    settleFrames: Math.max(1, opts.highResolutionCapture?.settleFrames || 3),
    timeout: Math.max(500, opts.highResolutionCapture?.timeout || 1800),
  }
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

  const createBaseVideoConstraints = () => {
    const isIOS = isIOSWebKit()
    const { width, height } = resolvePreferredVideoSize(resolution, isIOS)

    const videoConstraints: MediaTrackConstraints = {
      height: { ideal: height },
      width: { ideal: width },
      aspectRatio: { ideal: A4 },
    }
    if (supportsResizeMode()) {
      ;(
        videoConstraints as MediaTrackConstraints & {
          resizeMode?: { ideal: string }
        }
      ).resizeMode = { ideal: 'none' }
    }
    return videoConstraints
  }

  const startStream = async () => {
    if (!video.value) return
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access requires HTTPS or localhost.')
    }
    needsRestart.value = false

    const videoConstraints = createBaseVideoConstraints()

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

  const applyConstraintsWithTimeout = (
    mediaTrack: MediaStreamTrack,
    constraints: MediaTrackConstraints,
    timeout: number,
  ) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    return Promise.race([
      mediaTrack.applyConstraints(constraints),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Camera constraint switch timed out.')),
          timeout,
        )
      }),
    ]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId)
    })
  }

  const waitForVideoFrames = async (count: number) => {
    for (let i = 0; i < count; i++) {
      await new Promise<void>((resolve) => {
        const currentVideo = video.value as
          | (HTMLVideoElement & {
            requestVideoFrameCallback?: (callback: () => void) => number
          })
          | undefined
        if (currentVideo?.requestVideoFrameCallback) {
          currentVideo.requestVideoFrameCallback(() => resolve())
        } else {
          requestAnimationFrame(() => resolve())
        }
      })
    }
  }

  const createHighResolutionConstraints = (size: VideoSize) => {
    const aspectRatio = size.width / size.height
    const constraints: MediaTrackConstraints = {
      width: { ideal: size.width },
      height: { ideal: size.height },
      aspectRatio: { ideal: aspectRatio },
      advanced: [
        {
          width: size.width,
          height: size.height,
          aspectRatio,
        },
      ],
    }
    if (supportsResizeMode()) {
      ;(
        constraints as MediaTrackConstraints & {
          resizeMode?: { ideal: string }
        }
      ).resizeMode = { ideal: 'none' }
    }
    return constraints
  }

  const captureHighResolutionFrame = async () => {
    if (!highResolutionCapture.enabled || !video.value || !track.value) return

    const mediaTrack = track.value
    const baseWidth = video.value.videoWidth
    const baseHeight = video.value.videoHeight
    if (!baseWidth || !baseHeight || mediaTrack.readyState !== 'live') return

    const highResolutionSize = resolveHighResolutionVideoSize(
      baseWidth,
      baseHeight,
      highResolutionCapture.resolution,
      mediaTrack.getCapabilities?.(),
    )
    if (!highResolutionSize) return

    const baseConstraints = createBaseVideoConstraints()
    const highResolutionConstraints =
      createHighResolutionConstraints(highResolutionSize)

    try {
      await applyConstraintsWithTimeout(
        mediaTrack,
        highResolutionConstraints,
        highResolutionCapture.timeout,
      )
      await waitForVideoFrames(highResolutionCapture.settleFrames)

      const frame = getFrame()
      if (!frame) return
      frame.isHighResolution = Math.max(
        frame.imageData.width / baseWidth,
        frame.imageData.height / baseHeight,
      ) >= MIN_HIGH_RESOLUTION_GAIN
      return frame.isHighResolution ? frame : undefined
    } catch (error) {
      console.warn('High-resolution capture failed; using live frame.', error)
      return undefined
    } finally {
      await applyConstraintsWithTimeout(
        mediaTrack,
        baseConstraints,
        highResolutionCapture.timeout,
      ).catch((error) => {
        console.warn('Failed to restore live camera constraints.', error)
      })
      await waitForVideoFrames(1).catch(() => {})
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
    captureHighResolutionFrame,
    stream,
    streamFrameRate,
    track,
    tracks,
    isStreaming,
    needsRestart,
  }
}
