import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useStream } from '../src/runtime/composables/useStream'

const createTrack = (deviceId: string) => {
  const track = {
    id: `track-${deviceId}`,
    readyState: 'live',
    stop: vi.fn(() => {
      track.readyState = 'ended'
    }),
    getSettings: () => ({
      deviceId,
      width: 1280,
      height: 960,
      frameRate: 30,
    }),
    getCapabilities: () => ({}),
    getConstraints: () => ({}),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  return track
}

const createMediaStream = (track: ReturnType<typeof createTrack>) => ({
  getTracks: () => [track],
  getVideoTracks: () => [track],
})

const createVideo = () => ({
  autoplay: false,
  muted: false,
  defaultMuted: false,
  playsInline: false,
  readyState: 4,
  videoWidth: 1280,
  videoHeight: 960,
  srcObject: null as MediaStream | null,
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  load: vi.fn(),
  setAttribute: vi.fn(),
  removeAttribute: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('camera switching', () => {
  it('starts the selected camera immediately instead of waiting for detection', async () => {
    const firstTrack = createTrack('back-wide')
    const secondTrack = createTrack('back-tele')
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(createMediaStream(firstTrack))
      .mockResolvedValueOnce(createMediaStream(secondTrack))
    vi.stubGlobal('navigator', {
      userAgent: 'test-browser',
      platform: 'test',
      maxTouchPoints: 0,
      mediaDevices: {
        getUserMedia,
        getSupportedConstraints: () => ({}),
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: 'videoinput', deviceId: 'back-wide', label: 'Wide' },
          { kind: 'videoinput', deviceId: 'back-tele', label: 'Tele' },
        ]),
      },
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 0))
    vi.stubGlobal('cancelAnimationFrame', (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle))
    const video = createVideo()
    const camera = useStream({
      video: ref(video as unknown as HTMLVideoElement),
      resolution: 1280,
      facingMode: 'environment',
    })

    await camera.startStream()
    const switching = camera.selectTrack({
      deviceId: 'back-tele',
      label: 'Tele',
    })

    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(firstTrack.stop).toHaveBeenCalledOnce()
    expect(camera.isSwitchingCamera.value).toBe(true)

    await expect(switching).resolves.toBe(true)
    expect(camera.selectedDeviceId.value).toBe('back-tele')
    expect(camera.track.value).toBe(secondTrack)
    expect(video.load).not.toHaveBeenCalled()
    camera.stopStream()
  })
})
