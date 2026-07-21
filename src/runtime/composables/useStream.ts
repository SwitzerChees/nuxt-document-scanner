import { onUnmounted, ref, shallowRef, watch } from 'vue'
import type {
  DocumentScannerCamera,
  DocumentScannerVideoOptions,
} from '../types'
import { alignImageDataToReference } from '../utils/frame-orientation'

export type CapturedFrame = {
  imageData: ImageData
  scaleX: number
  scaleY: number
  isHighResolution?: boolean
  orientationAdjusted?: boolean
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

type NumericCapabilityRange = {
  min: number
  max: number
  step?: number
}

type ExtendedCapabilities = MediaTrackCapabilities & {
  focusMode?: string[]
  torch?: boolean
  zoom?: NumericCapabilityRange
  exposureCompensation?: NumericCapabilityRange
}

type ImageCaptureLike = {
  grabFrame?: () => Promise<ImageBitmap>
  takePhoto?: () => Promise<Blob>
  getPhotoCapabilities?: () => Promise<{
    imageWidth?: NumericCapabilityRange
    imageHeight?: NumericCapabilityRange
  }>
}

type ImageCaptureConstructor = new (
  track: MediaStreamTrack,
) => ImageCaptureLike

const isIOSWebKit = () => {
  const userAgent = navigator.userAgent || ''
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

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

const getImageCaptureConstructor = () =>
  (globalThis as unknown as { ImageCapture?: ImageCaptureConstructor })
    .ImageCapture

export const resolvePreferredVideoSize = (
  resolution: number,
  isIOS: boolean,
) => {
  const width = Math.max(
    640,
    Math.round(isIOS ? Math.min(resolution, IOS_MAX_RESOLUTION) : resolution),
  )
  // Width/height are soft ideals only. No aspect-ratio constraint is applied,
  // so the camera can retain its native field of view.
  return { width, height: Math.round(width * 0.75) }
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
  if (requestedLongEdge < currentLongEdge * MIN_HIGH_RESOLUTION_GAIN) return

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
  if (Math.max(width, height) < currentLongEdge * MIN_HIGH_RESOLUTION_GAIN) return
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
  const cameraState = ref<'idle' | 'requesting' | 'playing' | 'interrupted' | 'error'>('idle')
  const cameraSettings = ref<MediaTrackSettings>()
  const cameraCapabilities = ref<ExtendedCapabilities>()
  let canvas: HTMLCanvasElement | undefined
  let context: CanvasRenderingContext2D | null = null
  let captureGeneration = 0
  let activeCapture: Promise<CapturedFrame | undefined> | undefined
  let boundTrack: MediaStreamTrack | undefined

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
    const preferred = resolvePreferredVideoSize(resolution, isIOSWebKit())
    const constraints: MediaTrackConstraints = {
      width: { ideal: preferred.width },
      height: { ideal: preferred.height },
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

  const withTimeout = <T>(promise: Promise<T>, timeout: number, message: string) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeout)
      }),
    ]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId)
    })
  }

  const waitForVideoReady = async (element: HTMLVideoElement) => {
    if (element.readyState >= 2 && element.videoWidth && element.videoHeight) return
    await withTimeout(
      new Promise<void>((resolveReady, rejectReady) => {
        const cleanup = () => {
          element.removeEventListener('loadedmetadata', onReady)
          element.removeEventListener('canplay', onReady)
          element.removeEventListener('error', onError)
        }
        const onReady = () => {
          if (!element.videoWidth || !element.videoHeight) return
          cleanup()
          resolveReady()
        }
        const onError = () => {
          cleanup()
          rejectReady(new Error('Camera video element failed to load.'))
        }
        element.addEventListener('loadedmetadata', onReady)
        element.addEventListener('canplay', onReady)
        element.addEventListener('error', onError)
      }),
      5_000,
      'Camera video did not become ready.',
    )
  }

  const onTrackEnded = () => {
    isStreaming.value = false
    cameraState.value = 'interrupted'
    needsRestart.value = true
  }
  const onTrackMute = () => {
    cameraState.value = 'interrupted'
  }
  const onTrackUnmute = () => {
    if (boundTrack?.readyState === 'live') cameraState.value = 'playing'
  }

  const unbindTrackEvents = () => {
    boundTrack?.removeEventListener('ended', onTrackEnded)
    boundTrack?.removeEventListener('mute', onTrackMute)
    boundTrack?.removeEventListener('unmute', onTrackUnmute)
    boundTrack = undefined
  }

  const bindTrackEvents = (mediaTrack: MediaStreamTrack) => {
    unbindTrackEvents()
    boundTrack = mediaTrack
    mediaTrack.addEventListener('ended', onTrackEnded)
    mediaTrack.addEventListener('mute', onTrackMute)
    mediaTrack.addEventListener('unmute', onTrackUnmute)
  }

  const applyContinuousFocus = async (mediaTrack: MediaStreamTrack) => {
    const capabilities = mediaTrack.getCapabilities?.() as ExtendedCapabilities | undefined
    cameraCapabilities.value = capabilities
    if (!capabilities?.focusMode?.includes('continuous')) return
    await mediaTrack
      .applyConstraints({
        advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
      })
      .catch(() => {})
  }

  const stopStream = () => {
    captureGeneration++
    activeCapture = undefined
    unbindTrackEvents()
    for (const mediaTrack of stream.value?.getTracks() || []) mediaTrack.stop()
    stream.value = undefined
    track.value = undefined
    cameraSettings.value = undefined
    cameraCapabilities.value = undefined
    isStreaming.value = false
    needsRestart.value = false
    cameraState.value = 'idle'
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

  const startStream = async () => {
    const element = video.value
    if (!element) throw new Error('Camera video element is not mounted.')
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access requires HTTPS or localhost.')
    }
    if (isStreaming.value && track.value?.readyState === 'live') return
    stopStream()
    cameraState.value = 'requesting'
    const constraints = createBaseVideoConstraints()
    if (selectedDeviceId.value) {
      constraints.deviceId = { exact: selectedDeviceId.value }
    } else {
      constraints.facingMode = { ideal: facingMode }
    }

    let mediaStream: MediaStream | undefined
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: constraints,
        audio: false,
      })
      const mediaTrack = mediaStream.getVideoTracks()[0]
      if (!mediaTrack) throw new Error('Camera returned no video track.')
      stream.value = mediaStream
      track.value = mediaTrack
      bindTrackEvents(mediaTrack)
      await applyContinuousFocus(mediaTrack)
      cameraSettings.value = mediaTrack.getSettings()
      selectedDeviceId.value = cameraSettings.value.deviceId || selectedDeviceId.value
      streamFrameRate.value = cameraSettings.value.frameRate || 30
      element.srcObject = mediaStream
      await withTimeout(element.play(), 5_000, 'Camera video playback timed out.')
      await waitForVideoReady(element)
      isStreaming.value = true
      cameraState.value = 'playing'
      await refreshCameras().catch(() => {})
    } catch (error) {
      for (const mediaTrack of mediaStream?.getTracks() || []) mediaTrack.stop()
      stream.value = undefined
      track.value = undefined
      isStreaming.value = false
      cameraState.value = 'error'
      throw error
    }
  }

  const restartStream = async () => {
    stopStream()
    await startStream()
  }

  const getCanvasContext = () => {
    if (!canvas) {
      canvas = document.createElement('canvas')
      context = canvas.getContext('2d', { willReadFrequently: true })
    }
    return { canvas, context }
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
    if (!drawing.context) return
    const scale =
      maxSize && Math.max(sourceWidth, sourceHeight) > maxSize
        ? maxSize / Math.max(sourceWidth, sourceHeight)
        : 1
    const outputWidth = Math.max(1, Math.round(sourceWidth * scale))
    const outputHeight = Math.max(1, Math.round(sourceHeight * scale))
    if (drawing.canvas.width !== outputWidth || drawing.canvas.height !== outputHeight) {
      drawing.canvas.width = outputWidth
      drawing.canvas.height = outputHeight
    }
    drawing.context.drawImage(source, 0, 0, outputWidth, outputHeight)
    return {
      imageData: drawing.context.getImageData(0, 0, outputWidth, outputHeight),
      scaleX: coordinateWidth / outputWidth,
      scaleY: coordinateHeight / outputHeight,
    }
  }

  const getFrame = (maxSize?: number): CapturedFrame | undefined => {
    const element = video.value
    if (!element?.videoWidth || !element.videoHeight || !isStreaming.value) return
    return imageSourceToFrame(
      element,
      element.videoWidth,
      element.videoHeight,
      maxSize,
      element.videoWidth,
      element.videoHeight,
    )
  }

  const waitForVideoFrames = async (
    count: number,
    generation: number,
    mediaTrack: MediaStreamTrack,
  ) => {
    for (let index = 0; index < count; index++) {
      if (generation !== captureGeneration || mediaTrack.readyState !== 'live') {
        throw new Error('Capture was cancelled.')
      }
      let callbackId: number | undefined
      let animationId: number | undefined
      const element = video.value as
        | (HTMLVideoElement & {
          requestVideoFrameCallback?: (callback: () => void) => number
          cancelVideoFrameCallback?: (id: number) => void
        })
        | undefined
      await withTimeout(
        new Promise<void>((resolveFrame) => {
          if (element?.requestVideoFrameCallback) {
            callbackId = element.requestVideoFrameCallback(
              resolveFrame,
            )
          } else {
            animationId = requestAnimationFrame(() => resolveFrame())
          }
        }),
        Math.min(900, highResolutionCapture.timeout),
        'Timed out waiting for a settled camera frame.',
      ).finally(() => {
        if (callbackId !== undefined) element?.cancelVideoFrameCallback?.(callbackId)
        if (animationId !== undefined) cancelAnimationFrame(animationId)
      })
    }
  }

  const createHighResolutionConstraints = (size: VideoSize) => {
    const aspectRatio = size.width / size.height
    const constraints: MediaTrackConstraints = {
      width: { ideal: size.width },
      height: { ideal: size.height },
      aspectRatio: { ideal: aspectRatio },
      advanced: [{ width: size.width, height: size.height, aspectRatio }],
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

  const alignCapturedFrame = (
    frame: CapturedFrame,
    referenceFrame: CapturedFrame | undefined,
  ) => {
    if (!referenceFrame) return frame
    const aligned = alignImageDataToReference(frame.imageData, referenceFrame.imageData)
    if (!aligned.rotation) return frame
    return {
      ...frame,
      imageData: aligned.imageData,
      scaleX: 1,
      scaleY: 1,
      orientationAdjusted: true,
    }
  }

  const markHighResolutionFrame = (
    frame: CapturedFrame,
    baseWidth: number,
    baseHeight: number,
  ) => {
    frame.isHighResolution =
      Math.max(
        frame.imageData.width / baseWidth,
        frame.imageData.height / baseHeight,
      ) >= MIN_HIGH_RESOLUTION_GAIN
    return frame.isHighResolution ? frame : undefined
  }

  const captureImageCaptureFrame = async (
    mediaTrack: MediaStreamTrack,
    referenceFrame: CapturedFrame | undefined,
    baseWidth: number,
    baseHeight: number,
    generation: number,
  ) => {
    const ImageCapture = getImageCaptureConstructor()
    if (!ImageCapture || typeof createImageBitmap === 'undefined') return
    const capture = new ImageCapture(mediaTrack)
    let bitmap: ImageBitmap | undefined
    try {
      if (capture.takePhoto) {
        const blob = await withTimeout(
          capture.takePhoto(),
          highResolutionCapture.timeout,
          'Still photo capture timed out.',
        )
        if (generation !== captureGeneration || mediaTrack.readyState !== 'live') return
        bitmap = await createImageBitmap(blob)
      } else if (capture.grabFrame) {
        bitmap = await withTimeout(
          capture.grabFrame(),
          highResolutionCapture.timeout,
          'Video frame capture timed out.',
        )
      }
      if (
        !bitmap ||
        generation !== captureGeneration ||
        mediaTrack.readyState !== 'live'
      ) {
        return
      }
      const frame = imageSourceToFrame(
        bitmap,
        bitmap.width,
        bitmap.height,
        undefined,
        bitmap.width,
        bitmap.height,
      )
      return frame
        ? markHighResolutionFrame(
            alignCapturedFrame(frame, referenceFrame),
            baseWidth,
            baseHeight,
          )
        : undefined
    } catch (error) {
      console.warn('Still-image capture failed; trying camera constraints.', error)
      return
    } finally {
      bitmap?.close()
    }
  }

  const performHighResolutionCapture = async (
    mediaTrack: MediaStreamTrack,
    generation: number,
  ) => {
    const element = video.value
    if (!element) return
    const baseWidth = element.videoWidth
    const baseHeight = element.videoHeight
    if (!baseWidth || !baseHeight || mediaTrack.readyState !== 'live') return
    const referenceFrame = getFrame(320)
    const stillFrame = await captureImageCaptureFrame(
      mediaTrack,
      referenceFrame,
      baseWidth,
      baseHeight,
      generation,
    )
    if (stillFrame || generation !== captureGeneration) return stillFrame

    const size = resolveHighResolutionVideoSize(
      baseWidth,
      baseHeight,
      highResolutionCapture.resolution,
      mediaTrack.getCapabilities?.(),
    )
    if (!size) return
    const baseConstraints = mediaTrack.getConstraints()
    try {
      await withTimeout(
        mediaTrack.applyConstraints(createHighResolutionConstraints(size)),
        highResolutionCapture.timeout,
        'Camera constraint switch timed out.',
      )
      await waitForVideoFrames(highResolutionCapture.settleFrames, generation, mediaTrack)
      if (generation !== captureGeneration || mediaTrack.readyState !== 'live') return
      const settings = mediaTrack.getSettings()
      if (
        Math.max(settings.width || 0, settings.height || 0) <
        Math.max(baseWidth, baseHeight) * MIN_HIGH_RESOLUTION_GAIN
      ) {
        return
      }
      const frame = getFrame()
      return frame
        ? markHighResolutionFrame(
            alignCapturedFrame(frame, referenceFrame),
            baseWidth,
            baseHeight,
          )
        : undefined
    } catch (error) {
      if (generation === captureGeneration) {
        console.warn('High-resolution capture failed; using live frame.', error)
      }
      return
    } finally {
      if (generation === captureGeneration && mediaTrack.readyState === 'live') {
        await withTimeout(
          mediaTrack.applyConstraints(baseConstraints),
          highResolutionCapture.timeout,
          'Camera constraint restore timed out.',
        ).catch((error) => {
          console.warn('Failed to restore camera constraints.', error)
        })
        await waitForVideoFrames(
          Math.max(2, highResolutionCapture.settleFrames),
          generation,
          mediaTrack,
        ).catch(() => {})
      }
    }
  }

  const captureHighResolutionFrame = () => {
    const mediaTrack = track.value
    if (
      !highResolutionCapture.enabled ||
      !video.value ||
      !mediaTrack ||
      mediaTrack.readyState !== 'live'
    ) {
      return Promise.resolve(undefined)
    }
    if (activeCapture) return activeCapture
    const generation = ++captureGeneration
    activeCapture = performHighResolutionCapture(mediaTrack, generation).finally(() => {
      if (generation === captureGeneration) activeCapture = undefined
    })
    return activeCapture
  }

  const selectTrack = (camera: DocumentScannerCamera) => {
    if (!camera.deviceId || camera.deviceId === selectedDeviceId.value) return
    selectedDeviceId.value = camera.deviceId
    if (isStreaming.value) needsRestart.value = true
  }

  const onDeviceChange = () => {
    void refreshCameras()
    if (track.value?.readyState !== 'live') needsRestart.value = true
  }
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && track.value?.readyState !== 'live') {
      needsRestart.value = true
    }
  }
  const onPageHide = () => stopStream()

  if (import.meta.client) {
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)
  }

  watch(track, (newTrack, oldTrack) => {
    if (newTrack && oldTrack && newTrack.id !== oldTrack.id && isStreaming.value) {
      needsRestart.value = true
    }
  })

  onUnmounted(() => {
    navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', onPageHide)
    stopStream()
  })

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
    selectedDeviceId,
    cameraState,
    cameraSettings,
    cameraCapabilities,
    isStreaming,
    needsRestart,
  }
}
