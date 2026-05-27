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

type ImageCaptureLike = {
  takePhoto: () => Promise<Blob>
}

type ImageCaptureConstructor = new (track: MediaStreamTrack) => ImageCaptureLike

type SourceRect = {
  sx: number
  sy: number
  sWidth: number
  sHeight: number
}

const isIOSWebKit = () => {
  const ua = navigator.userAgent || ''
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export const resolvePreferredVideoSize = (
  resolution: number,
  isPortrait: boolean,
) => {
  const longEdge = Math.max(640, Math.round(resolution || 1920))
  const shortEdge = Math.round(longEdge * (9 / 16))

  return isPortrait
    ? { width: shortEdge, height: longEdge }
    : { width: longEdge, height: shortEdge }
}

export const resolveCenteredAspectCrop = (
  sourceWidth: number,
  sourceHeight: number,
  targetAspect: number,
): SourceRect => {
  const sourceAspect = sourceWidth / sourceHeight

  if (sourceAspect > targetAspect) {
    const sWidth = sourceHeight * targetAspect
    return {
      sx: (sourceWidth - sWidth) / 2,
      sy: 0,
      sWidth,
      sHeight: sourceHeight,
    }
  }

  const sHeight = sourceWidth / targetAspect
  return {
    sx: 0,
    sy: (sourceHeight - sHeight) / 2,
    sWidth: sourceWidth,
    sHeight,
  }
}

export const useStream = (opts: DocumentScannerVideoOptions) => {
  const { facingMode, video, resolution, captureResolution } = opts
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
    const safeResolution = isIOS ? Math.min(resolution, 1280) : resolution
    const isPortrait =
      typeof window === 'undefined' ? true : window.innerHeight >= window.innerWidth
    const { width, height } = resolvePreferredVideoSize(
      safeResolution,
      isPortrait,
    )

    const videoConstraints: MediaTrackConstraints = {
      height: { ideal: height },
      width: { ideal: width },
      aspectRatio: { ideal: width / height },
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
    sourceRect?: SourceRect,
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

    if (sourceRect) {
      drawing.ctx.drawImage(
        source,
        sourceRect.sx,
        sourceRect.sy,
        sourceRect.sWidth,
        sourceRect.sHeight,
        0,
        0,
        outputWidth,
        outputHeight,
      )
    } else {
      drawing.ctx.drawImage(source, 0, 0, outputWidth, outputHeight)
    }
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

  const blobToImageElement = (blob: Blob) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(blob)
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve(img)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Could not decode captured photo.'))
      }
      img.src = url
    })

  const capturePhotoFrame = async (): Promise<CapturedFrame | undefined> => {
    if (!video.value || !track.value) return
    if (isIOSWebKit()) return

    const ImageCaptureCtor = (
      window as Window & { ImageCapture?: ImageCaptureConstructor }
    ).ImageCapture
    if (!ImageCaptureCtor) return

    const videoWidth = video.value.videoWidth
    const videoHeight = video.value.videoHeight
    if (!videoWidth || !videoHeight) return

    const photoBlob = await new ImageCaptureCtor(track.value).takePhoto()
    let imageBitmap: ImageBitmap | undefined
    let imageElement: HTMLImageElement | undefined

    try {
      const createBitmap = (
        window as Window & {
          createImageBitmap?: typeof createImageBitmap
        }
      ).createImageBitmap
      if (createBitmap) {
        imageBitmap = await createBitmap(photoBlob, {
          imageOrientation: 'from-image',
        } as ImageBitmapOptions)
      } else {
        imageElement = await blobToImageElement(photoBlob)
      }

      const source = imageBitmap || imageElement
      if (!source) return

      const photoWidth = source.width
      const photoHeight = source.height
      const videoAspect = videoWidth / videoHeight
      const photoAspect = photoWidth / photoHeight
      const aspectDelta = Math.abs(videoAspect - photoAspect) / videoAspect
      if (aspectDelta > 0.48) return
      const sourceRect =
        aspectDelta > 0.05
          ? resolveCenteredAspectCrop(photoWidth, photoHeight, videoAspect)
          : undefined

      const maxCaptureSize = isIOSWebKit()
        ? Math.min(captureResolution, 1280)
        : Math.max(resolution, captureResolution || resolution)

      return imageSourceToFrame(
        source,
        sourceRect?.sWidth || photoWidth,
        sourceRect?.sHeight || photoHeight,
        maxCaptureSize,
        videoWidth,
        videoHeight,
        sourceRect,
      )
    } finally {
      imageBitmap?.close()
    }
  }

  const captureFrame = async () => {
    return (await capturePhotoFrame().catch(() => undefined)) || getFrame()
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
    captureFrame,
    stream,
    streamFrameRate,
    track,
    tracks,
    isStreaming,
    needsRestart,
  }
}
