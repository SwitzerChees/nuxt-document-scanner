import { shallowRef } from 'vue'

export const useCamera = () => {
  const stream = shallowRef<MediaStream>()

  const start = async (video: HTMLVideoElement, highRes = false) => {
    if (!video) return

    // Dual-resolution system:
    // - Low res (480p) for real-time detection (fast)
    // - High res (4K) only for capture (quality)
    const constraints = {
      video: {
        facingMode: 'environment',
        width: { ideal: highRes ? 3840 : 640 },
        height: { ideal: highRes ? 2160 : 480 },
      },
      audio: false,
    } satisfies MediaStreamConstraints

    const s = await navigator.mediaDevices.getUserMedia(constraints)
    stream.value = s
    video.srcObject = s
    await video.play()

    const track = s.getVideoTracks()[0]
    const settings = track?.getSettings()

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
  ) => {
    console.log(`📹 Switching resolution (highRes=${highRes})...`)

    // Stop current stream
    stop()

    // Wait a bit for cleanup
    await new Promise((resolve: (value: unknown) => void) => {
      setTimeout(resolve, 100)
    })

    // Start with new resolution
    const result = await start(video, highRes)

    return result
  }

  return { start, stop, stream, switchResolution }
}
