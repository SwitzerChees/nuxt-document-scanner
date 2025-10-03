import { shallowRef } from 'vue'

type StartOptions = {
  highRes?: boolean
  width?: number
  height?: number
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
      highResolution = 3840,
    }: StartOptions = {},
  ) => {
    if (!video) return

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

    console.log('📹 Camera started:', {
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

  // Switch resolution by restarting camera (more reliable than applyConstraints)
  const switchResolution = async (
    video: HTMLVideoElement,
    highRes: boolean,
    options?: { width?: number; height?: number; highResolution?: number },
  ) => {
    console.log(`📹 Switching resolution (highRes=${highRes})...`)

    // Stop current stream
    stop()

    // Wait a bit for cleanup
    await new Promise((resolve: (value: unknown) => void) => {
      setTimeout(resolve, 100)
    })

    // Start with new resolution
    const result = await start(video, {
      highRes,
      width: options?.width,
      height: options?.height,
      highResolution: options?.highResolution,
    })

    return result
  }

  return { start, stop, stream, switchResolution }
}
