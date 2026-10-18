import { onUnmounted, ref, shallowRef } from 'vue'
import type { DocumentScannerCamera, DocumentScannerVideoOptions } from '../types'
import { ScannerCamera } from '../core/camera'
import { friendlyCameraNames } from '../engine/cameraChoice'

export type CapturedFrame = {
  imageData: ImageData;
  scaleX: number;
  scaleY: number;
  matchesPreviewGeometry: boolean;
  isHighResolution?: boolean;
  orientationAdjusted?: boolean;
}
const MIN_HIGH_RESOLUTION_GAIN = 1.15
export const resolvePreferredVideoSize = (resolution: number, _isIOS: boolean) => {
  const longEdge = Math.max(640, Math.round(resolution))
  // Request a native-like 4:3 sensor mode regardless of screen orientation.
  // Swapping width and height on rotation can make WebKit crop the source to
  // satisfy portrait constraints instead of returning the full camera field.
  return { width: longEdge, height: Math.round(longEdge * 0.75) }
}
export const resolveHighResolutionVideoSize = (currentWidth: number, currentHeight: number, targetLongEdge: number, capabilities?: MediaTrackCapabilities) => {
  if (!currentWidth || !currentHeight)
    return undefined
  const currentLongEdge = Math.max(currentWidth, currentHeight)
  const requestedLongEdge = Math.max(currentLongEdge, Math.round(targetLongEdge || currentLongEdge))
  if (requestedLongEdge < currentLongEdge * MIN_HIGH_RESOLUTION_GAIN)
    return
  const aspectRatio = currentWidth / currentHeight
  let width = currentWidth >= currentHeight
    ? requestedLongEdge
    : Math.round(requestedLongEdge * aspectRatio)
  let height = currentWidth >= currentHeight
    ? Math.round(requestedLongEdge / aspectRatio)
    : requestedLongEdge
  const widthCapability = capabilities?.width
  const heightCapability = capabilities?.height
  const maxWidth = typeof widthCapability === 'object' && 'max' in widthCapability
    ? widthCapability.max
    : undefined
  const maxHeight = typeof heightCapability === 'object' && 'max' in heightCapability
    ? heightCapability.max
    : undefined
  const capScale = Math.min(maxWidth ? maxWidth / width : 1, maxHeight ? maxHeight / height : 1, 1)
  width = Math.max(1, Math.round(width * capScale))
  height = Math.max(1, Math.round(height * capScale))
  if (Math.max(width, height) < currentLongEdge * MIN_HIGH_RESOLUTION_GAIN)
    return
  return { width, height }
}
/** Nuxt/Vue lifecycle adapter for the same camera engine used by OmniSearch. */
export const useStream = (opts: DocumentScannerVideoOptions) => {
  const track = shallowRef<MediaStreamTrack>()
  const tracks = shallowRef<DocumentScannerCamera[]>([])
  const selectedDeviceId = ref<string>()
  const isStreaming = ref(false), isSwitchingCamera = ref(false), needsRestart = ref(false)
  const cameraState = ref<'idle' | 'requesting' | 'playing' | 'interrupted' | 'error'>('idle')
  const cameraSettings = ref<MediaTrackSettings>()
  const cameraCapabilities = ref<MediaTrackCapabilities & {
    torch?: boolean;
  }>()
  const streamFrameRate = ref(30), torchOn = ref(false), torchSupported = ref(false)
  let camera: ScannerCamera | undefined
  let generation = 0
  const stopStream = () => {
    generation++
    camera?.stop()
    track.value = undefined
    isStreaming.value = false
    needsRestart.value = false
    torchOn.value = false
    cameraState.value = 'idle'
  }
  const startStream = async () => {
    const video = opts.video.value
    if (!video)
      throw new Error('Camera video element is not mounted.')
    if (isStreaming.value)
      return
    const seq = ++generation
    video.autoplay = video.muted = video.defaultMuted = video.playsInline = true
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    camera ||= new ScannerCamera(video, () => {
      needsRestart.value = true
      cameraState.value = 'interrupted'
    }, {
      resolution: opts.resolution,
      facingMode: opts.facingMode,
      photoResolution: opts.highResolutionCapture?.resolution ?? 3200,
      photoTimeout: opts.highResolutionCapture?.timeout ?? 2500,
    })
    cameraState.value = 'requesting'
    try {
      const devices = await camera.start(selectedDeviceId.value)
      const names = friendlyCameraNames(devices.map(device => device.label), { camera: 'Camera', backCamera: 'Back camera', frontCamera: 'Front camera' })
      tracks.value = devices.map((device, i) => ({ ...device, label: names[i]! }))
      if (seq !== generation)
        return
      track.value = camera.track
      cameraSettings.value = camera.track?.getSettings()
      cameraCapabilities.value = camera.track?.getCapabilities?.()
      selectedDeviceId.value = cameraSettings.value?.deviceId
      streamFrameRate.value = cameraSettings.value?.frameRate ?? 30
      torchSupported.value = camera.torchSupported
      torchOn.value = false
      isStreaming.value = true
      cameraState.value = 'playing'
    }
    catch (error) {
      if (seq !== generation)
        return
      isStreaming.value = false
      cameraState.value = 'error'
      throw error
    }
  }
  const restartStream = async () => {
    stopStream()
    await startStream()
  }
  const selectTrack = async (choice: DocumentScannerCamera) => {
    if (!choice.deviceId || choice.deviceId === selectedDeviceId.value || isSwitchingCamera.value)
      return false
    const previous = selectedDeviceId.value
    selectedDeviceId.value = choice.deviceId
    if (!isStreaming.value)
      return true
    isSwitchingCamera.value = true
    try {
      await restartStream()
      return isStreaming.value
    }
    catch (error) {
      selectedDeviceId.value = previous
      await startStream().catch(() => { })
      throw error
    }
    finally {
      isSwitchingCamera.value = false
    }
  }
  const setTorch = async (on: boolean) => {
    if (await camera?.setTorch(on))
      torchOn.value = on
  }
  // All hot paths transfer bitmaps. Pixel readback and burst scoring happen in workers.
  const getDetectionFrame = (edge = 512) => camera?.frame(edge) ?? Promise.resolve(undefined)
  const captureBurst = () => camera?.burst() ?? Promise.resolve([])
  const captureStill = async () => {
    if (opts.highResolutionCapture?.enabled === false) return
    const photo = await camera?.still()
    if (!camera?.healthy) needsRestart.value = true
    return photo
  }
  const focusAt = (point: {
    x: number;
    y: number;
  }) => camera?.focusAt(point) ?? Promise.resolve(false)
  onUnmounted(stopStream)
  return {
    startStream, stopStream, restartStream, selectTrack, getDetectionFrame, captureBurst, captureStill,
    focusAt, setTorch, torchOn, torchSupported, track, tracks, selectedDeviceId, isStreaming,
    isSwitchingCamera, needsRestart, cameraState, cameraSettings, cameraCapabilities, streamFrameRate,
  }
}
