import { pickDocumentCamera } from '../engine/cameraChoice'
import type { CameraCandidate } from '../engine/cameraChoice'
import type { DocumentScannerCamera } from '../types'

export async function deadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('cameraTimeout')), ms)
    })])
  }
  finally {
    clearTimeout(timer)
  }
}
type PhotoCapture = {
  takePhoto?: (options?: {
    imageWidth?: number;
    imageHeight?: number;
  }) => Promise<Blob>;
  getPhotoCapabilities?: () => Promise<{
    imageWidth?: {
      max: number;
    };
    imageHeight?: {
      max: number;
    };
  }>;
}
type DeviceWithCapabilities = MediaDeviceInfo & {
  getCapabilities?: () => CameraCandidate['capabilities'];
}
/**
 * Requested stream size. Detection cost does not depend on it (frames are downscaled on the GPU), but pages cut from
 * video frames are: 1280×960 gives an A4 page ~110 dpi, 4K ~260 dpi. Browsers fall back to the nearest mode.
 */
const STREAM = { width: 3840, height: 2160 }
/** Long edge of the frames handed to the detector; the worker area-filters them down to the model input. */
const DETECTION_EDGE = 512
/** Burst frames per capture, two video frames apart; the sharpest is kept. */
const BURST_FRAMES = 3
/** Stills slower than this make capture feel stuck (seconds on e.g. a Galaxy S20); that camera then skips them. */
const SLOW_STILL_MS = 1200
const STILL_TIMEOUT_MS = 2500
const CAMERA_KEY = 'nuxt-document-scanner.camera'
const SLOW_STILL_KEY = 'nuxt-document-scanner.slowStill'
const storage = {
  get: (key: string) => { try {
    return localStorage.getItem(key) ?? undefined
  }
  catch {
    return undefined
  } },
  set: (key: string, value: string) => { try {
    localStorage.setItem(key, value)
  }
  catch { /* private mode: decided again next time */ } },
}
export class ScannerCamera {
  private stream?: MediaStream
  private generation = 0
  private resizeSupported = true
  constructor(private video: HTMLVideoElement, private interrupted: () => void, private options: {
    resolution?: number;
    facingMode?: 'environment' | 'user';
    photoResolution?: number;
    photoTimeout?: number;
  } = {}) { }
  get healthy() { return this.track?.readyState === 'live' && !this.track.muted }
  get track() { return this.stream?.getVideoTracks()[0] }
  get label() { return this.track?.label ?? '' }
  private request(deviceId?: string) {
    return navigator.mediaDevices.getUserMedia({ audio: false, video: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: this.options.facingMode ?? 'environment' } }),
      width: { ideal: this.options.resolution ?? STREAM.width }, height: { ideal: Math.round((this.options.resolution ?? STREAM.width) * STREAM.height / STREAM.width) }, frameRate: { ideal: 30, max: 30 },
    } })
  }
  private async open(deviceId: string | undefined, generation: number) {
    const request = this.request(deviceId)
    // A permission dialog may resolve after the caller has stopped or timed out.
    void request.then(stream => {
      if (generation !== this.generation) stream.getTracks().forEach(t => t.stop())
    }).catch(() => { })
    const stream = await deadline(request, 30000)
    if (generation !== this.generation) {
      stream.getTracks().forEach(t => t.stop())
      throw new Error('cancelled')
    }
    return stream
  }
  private static async cameras(): Promise<CameraCandidate[]> {
    const devices = await navigator.mediaDevices.enumerateDevices?.().catch(() => []) ?? []
    return devices.filter(d => d.kind === 'videoinput').map(d => ({ deviceId: d.deviceId, label: d.label, capabilities: (d as DeviceWithCapabilities).getCapabilities?.() }))
  }
  /**
   * Without an explicit choice, `facingMode: environment` often yields a lens that cannot focus at scanning distance
   * (the 1x camera of Pro iPhones, ultra-wide or fixed-focus sensors on Android). Labels are readable only after
   * permission, so the first stream is used to choose and the camera is reopened when a better one exists.
   */
  async start(deviceId?: string): Promise<DocumentScannerCamera[]> {
    this.stop()
    const generation = this.generation
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error('cameraUnavailable')
    try {
      const preferred = deviceId ?? (this.options.facingMode === 'user' ? undefined : storage.get(CAMERA_KEY))
      let stream = await this.open(preferred, generation).catch(error => {
        if (!preferred || deviceId || (error instanceof Error && ['cancelled', 'cameraTimeout'].includes(error.message)))
          throw error
        return this.open(undefined, generation)
      })
      const cameras = await ScannerCamera.cameras()
      if (generation !== this.generation) {
        stream.getTracks().forEach(track => track.stop())
        throw new Error('cancelled')
      }
      const current = stream.getVideoTracks()[0]?.getSettings().deviceId
      const best = deviceId || this.options.facingMode === 'user' ? undefined : pickDocumentCamera(cameras)
      if (!preferred && best && best !== current) {
        stream.getTracks().forEach(t => t.stop())
        stream = await this.open(best, generation)
      }
      this.stream = stream
      const chosen = this.track?.getSettings().deviceId
      if (chosen && this.options.facingMode !== 'user')
        storage.set(CAMERA_KEY, chosen)
      this.video.srcObject = stream
      this.track?.addEventListener('ended', this.interrupted)
      this.track?.addEventListener('mute', this.interrupted)
      await this.configureFocus()
      await deadline(this.video.play(), 8000)
      await this.waitFrames(1)
      if (generation !== this.generation)
        throw new Error('cancelled')
      return cameras.map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }))
    }
    catch (error) {
      if (generation === this.generation)
        this.stop()
      throw error
    }
  }
  private async configureFocus() {
    const track = this.track
    if (!track?.getCapabilities)
      return
    const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
      focusMode?: string[];
      exposureMode?: string[];
      whiteBalanceMode?: string[];
    }
    const controls: Record<string, string> = {}
    for (const key of ['focusMode', 'exposureMode', 'whiteBalanceMode'] as const) {
      if (capabilities[key]?.includes('continuous'))
        controls[key] = 'continuous'
    }
    if (!Object.keys(controls).length)
      return
    try {
      await deadline(track.applyConstraints({ advanced: [controls as MediaTrackConstraintSet] }), 2500)
    }
    catch (error) {
      if (error instanceof Error && error.message === 'cameraTimeout')
        throw error
    }
  }
  stop() {
    this.generation++
    clearTimeout(this.focusTimer)
    this.track?.removeEventListener('ended', this.interrupted)
    this.track?.removeEventListener('mute', this.interrupted)
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = undefined
    this.video.pause()
    this.video.srcObject = null
  }
  get size() { return { width: this.video.videoWidth, height: this.video.videoHeight } }
  private get capabilities() {
    return (this.track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
      torch?: boolean;
      focusMode?: string[];
    }
  }
  /** Most Android phones can switch on the flash LED as a torch; iPhone browsers cannot. */
  get torchSupported() { return Boolean(this.capabilities.torch) }
  async setTorch(on: boolean) {
    const track = this.track
    if (!track || !this.torchSupported)
      return false
    try {
      await deadline(track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }), 2500)
      return true
    }
    catch {
      return false
    }
  }
  /**
   * Focuses on a point of the frame (0–1 each way) where the browser supports it (Chrome on Android): a single
   * focus at the point, then back to continuous focus so the next page is followed again.
   */
  async focusAt(point: {
    x: number;
    y: number;
  }) {
    const track = this.track, modes = this.capabilities.focusMode ?? []
    if (!track || !modes.length)
      return false
    const mode = modes.includes('single-shot') ? 'single-shot' : modes.includes('continuous') ? 'continuous' : undefined
    if (!mode)
      return false
    try {
      await deadline(track.applyConstraints({ advanced: [{ pointsOfInterest: [point], focusMode: mode } as MediaTrackConstraintSet] }), 2500)
    }
    catch {
      return false
    }
    clearTimeout(this.focusTimer)
    if (mode === 'single-shot' && modes.includes('continuous')) {
      this.focusTimer = setTimeout(() => {
        void track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => { })
      }, 3000)
    }
    return true
  }
  private focusTimer?: ReturnType<typeof setTimeout>
  /** A small frame for detection, downscaled on the GPU while grabbing; the worker takes it over (transfer). */
  async frame(edge = DETECTION_EDGE): Promise<ImageBitmap | undefined> {
    const { width: w, height: h } = this.size
    if (!w || !h || this.video.readyState < 2)
      return
    const scale = Math.min(1, edge / Math.max(w, h))
    if (this.resizeSupported) {
      const frame = await createImageBitmap(this.video, { resizeWidth: Math.max(1, Math.round(w * scale)), resizeHeight: Math.max(1, Math.round(h * scale)), resizeQuality: 'medium' })
        .catch(() => {
          this.resizeSupported = false
          return undefined
        })
      if (frame)
        return frame
    }
    return createImageBitmap(this.video)
  }
  /** Full-resolution frames of the current moment; the processing worker keeps the sharpest. */
  async burst(): Promise<ImageBitmap[]> {
    const frames: ImageBitmap[] = []
    const generation = this.generation
    try {
      for (let i = 0; i < BURST_FRAMES; i++) {
        if (i)
          await this.waitFrames(2).catch(() => undefined)
        if (generation !== this.generation)
          throw new Error('cancelled')
        frames.push(await createImageBitmap(this.video))
      }
      return frames
    }
    catch (error) {
      frames.forEach(frame => frame.close())
      throw error
    }
  }
  private waitFrames(count: number) {
    return new Promise<void>((resolve, reject) => {
      let handle = 0, finished = false
      const native = typeof this.video.requestVideoFrameCallback === 'function'
      const finish = (error?: Error) => {
        if (finished)
          return
        finished = true
        clearTimeout(timer)
        if (native)
          this.video.cancelVideoFrameCallback(handle)
        else
          cancelAnimationFrame(handle)
        if (error)
          reject(error)
        else
          resolve()
      }
      const timer = setTimeout(() => finish(new Error('cameraTimeout')), 2500)
      const next = () => {
        if (finished)
          return
        if (--count <= 0 && this.video.readyState >= 2)
          return finish()
        handle = native ? this.video.requestVideoFrameCallback(next) : requestAnimationFrame(next)
      }
      handle = native ? this.video.requestVideoFrameCallback(next) : requestAnimationFrame(next)
    })
  }
  /** Photo dimensions capped at 3200px on the long edge: enough for a page, far less memory than 12 MP or more. */
  private async photoSize(photo: PhotoCapture) {
    const caps = await deadline(photo.getPhotoCapabilities?.() || Promise.resolve(undefined), 1500)
    if (!caps?.imageWidth || !caps.imageHeight)
      return undefined
    const scale = Math.min(1, (this.options.photoResolution ?? 3200) / Math.max(caps.imageWidth.max, caps.imageHeight.max))
    return { imageWidth: Math.round(caps.imageWidth.max * scale), imageHeight: Math.round(caps.imageHeight.max * scale) }
  }
  private get slowStillKey() { return `${SLOW_STILL_KEY}:${this.track?.getSettings().deviceId ?? ''}` }
  /**
   * A full-resolution photo through the camera's still pipeline (Chrome on Android), or undefined where browsers do
   * not offer one (Safari) or this camera has proven too slow. Callers must have grabbed their burst already.
   */
  async still(): Promise<Blob | undefined> {
    const track = this.track
    const Photo = (globalThis as unknown as {
      ImageCapture?: new (track: MediaStreamTrack) => PhotoCapture;
    }).ImageCapture
    if (!track || track.readyState !== 'live' || !Photo || storage.get(this.slowStillKey))
      return
    const generation = this.generation, started = performance.now()
    try {
      const photo = new Photo(track)
      if (!photo.takePhoto)
        return
      const blob = await deadline(photo.takePhoto(await this.photoSize(photo)), (this.options.photoTimeout ?? STILL_TIMEOUT_MS))
      if (generation !== this.generation)
        throw new Error('cancelled')
      return blob?.size ? blob : undefined
    }
    catch (error) {
      if (generation !== this.generation)
        throw new Error('cancelled')
      // End an uncancellable timed-out operation's track before another capture can start.
      if (error instanceof Error && error.message === 'cameraTimeout')
        this.stop()
      return undefined
    }
    finally {
      if (performance.now() - started > SLOW_STILL_MS)
        storage.set(this.slowStillKey, '1')
    }
  }
}
