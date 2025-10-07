import { ref, shallowRef } from 'vue'

type StartOptions = {
  facingMode?: 'environment' | 'user'
  width: number
  height: number
}

export const useVideo = () => {
  const stream = shallowRef<MediaStream>()
  const isStreaming = ref(false)

  const start = async (video: HTMLVideoElement, opts: StartOptions) => {
    if (!video) return

    const { facingMode = 'environment', width, height } = opts

    const constraints = {
      video: {
        facingMode,
        width,
        height,
      },
      audio: false,
    } satisfies MediaStreamConstraints

    const s = await navigator.mediaDevices.getUserMedia(constraints)
    stream.value = s
    video.srcObject = s
    await video.play()

    const track = s.getVideoTracks()[0]
    const settings = track?.getSettings()

    isStreaming.value = true

    return { width: settings?.width || 0, height: settings?.height || 0 }
  }

  const stop = () => {
    if (!stream.value) return
    stream.value.getTracks().forEach((t: MediaStreamTrack) => t.stop())
    isStreaming.value = false
  }

  return { start, stop, stream, isStreaming }
}
