import { shallowRef } from 'vue'
import { log } from '../utils/logging'

type StartOptions = {
  highRes?: boolean
  width?: number
  height?: number
  trackingResolution?: number
  highResolution?: number
}

export const useCamera = () => {
  const stream = shallowRef<MediaStream>()

  const start = async (
    video: HTMLVideoElement,
    {
      highRes = false,
      width,
      height,
      trackingResolution = 1920,
      highResolution = 3840,
    }: StartOptions = {},
  ) => {
    if (!video) return

    // if height is higher than trackingResolution, use trackingResolution but keep aspect ratio
    if (height && height > trackingResolution) {
      width = Math.round(trackingResolution * (height / trackingResolution))
      height = trackingResolution
    }

    // For high-res capture, use configured resolution
    // For normal mode, use exact display dimensions for 1:1 mapping
    const targetWidth = highRes ? highResolution : width || 1920
    const targetHeight = highRes ? highResolution : height || 1080

    const constraints = {
      video: {
        facingMode: 'environment',
        width: { ideal: targetWidth },
        height: { ideal: targetHeight },
      },
      audio: false,
    } satisfies MediaStreamConstraints

    const s = await navigator.mediaDevices.getUserMedia(constraints)
    stream.value = s
    video.srcObject = s
    await video.play()

    const track = s.getVideoTracks()[0]
    const settings = track?.getSettings()

    log('📹 Camera started:', {
      requested: `${targetWidth}x${targetHeight}`,
      actual: `${settings?.width}x${settings?.height}`,
      display: width && height ? `${width}x${height}` : 'N/A',
    })

    return { width: settings?.width || 0, height: settings?.height || 0 }
  }

  const stop = () => {
    if (!stream.value) return
    stream.value.getTracks().forEach((t: MediaStreamTrack) => t.stop())
  }

  return { start, stop, stream }
}
