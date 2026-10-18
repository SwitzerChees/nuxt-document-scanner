import { afterEach, expect, vi, test } from 'vitest'
import { ScannerCamera } from '../src/runtime/core/camera'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const fixture = () => {
  let deliver!: (stream: MediaStream) => void
  const request = new Promise<MediaStream>((resolve) => {
    deliver = resolve
  })
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => request } })
  const video = { pause: () => {}, srcObject: null } as unknown as HTMLVideoElement
  const stop = vi.fn()
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream
  return { camera: new ScannerCamera(video, () => {}), deliver: () => deliver(stream), stop }
}

test('closing while the permission dialog is open stops a stream granted later', async () => {
  const f = fixture()
  const started = f.camera.start()
  f.camera.stop()
  f.deliver()
  await expect(started).rejects.toThrow('cancelled')
  expect(f.stop).toHaveBeenCalled()
})

test('a timed-out permission request cannot reopen an unseen camera later', async () => {
  vi.useFakeTimers()
  const f = fixture()
  const result = f.camera.start().then(() => false, () => true)
  await vi.advanceTimersByTimeAsync(30001)
  expect(await result).toBe(true)
  f.deliver()
  await Promise.resolve()
  await Promise.resolve()
  expect(f.stop).toHaveBeenCalled()
})

test('closing while camera names load also releases the opened track', async () => {
  let deliverNames!: (devices: MediaDeviceInfo[]) => void
  const names = new Promise<MediaDeviceInfo[]>((resolve) => {
    deliverNames = resolve
  })
  const stop = vi.fn()
  const stream = { getTracks: () => [{ stop }], getVideoTracks: () => [{ getSettings: () => ({}) }] } as unknown as MediaStream
  const enumerateDevices = vi.fn(() => names)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => stream, enumerateDevices } })
  const video = { pause: () => {}, srcObject: null } as unknown as HTMLVideoElement
  const camera = new ScannerCamera(video, () => {})
  const started = camera.start()
  await vi.waitFor(() => expect(enumerateDevices).toHaveBeenCalled())
  camera.stop()
  deliverNames([])
  await expect(started).rejects.toThrow('cancelled')
  expect(stop).toHaveBeenCalledOnce()
})
