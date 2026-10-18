import { distance, isPlausibleDocument, maxCornerShift } from './geometry'
import type { Quad, Size } from './geometry'

export type TrackerOptions = {
  /** Lowest heatmap peak (of the weakest corner) accepted as a document. Empty scenes stay far below. */
  minConfidence: number;
  minAreaRatio?: number;
  maxSideRatio?: number;
  /** How long a document may go undetected before the outline is dropped. */
  lostAfterMs: number;
  /** Largest corner movement since the countdown started, as a share of the frame diagonal, that still counts as holding still. */
  steadyThreshold: number;
  /** Movement beyond this share of the diagonal snaps the outline instead of easing it. */
  jumpThreshold: number;
  /** How long the document must be held still before it is captured automatically. */
  captureAfterMs: number;
  /** After a capture, how far the document must move (share of the diagonal) — or disappear — before the next one. */
  rearmShift: number;
  /** Auto capture waits until the frame is at least this sharp relative to the sharpest one seen while held still. */
  focusRatio: number;
  /**
   * Shortest / longest of each pair of opposite sides. Below this the phone is tilted so far that the near and far
   * edges of the page cannot both be in focus at scanning distance (shallow depth of field of phone main cameras).
   */
  minParallelism: number;
  /** A corner closer than this share of the frame to its border means the page fills the lens's softest zone. */
  minBorderMargin: number;
  autoCapture: boolean;
}
export type TrackerStatus = 'searching' | 'tracking' | 'steady'
/** What keeps a detected page from being captured well, shown to the user as advice. */
export type TrackerHint = 'tilted' | 'too-close'
export type TrackerState = {
  status: TrackerStatus;
  /** Smoothed outline for display and capture, in frame pixels. */
  quad?: Quad;
  /** 0–1 progress towards the automatic capture. */
  progress: number;
  shouldCapture: boolean;
  hint?: TrackerHint;
}
export type Detection = {
  quad: Quad;
  confidence: number;
  sharpness?: number;
}
export const DEFAULT_TRACKER_OPTIONS: TrackerOptions = {
  minConfidence: 0.5,
  lostAfterMs: 450,
  steadyThreshold: 0.02,
  jumpThreshold: 0.08,
  captureAfterMs: 1100,
  rearmShift: 0.15,
  focusRatio: 0.85,
  minParallelism: 0.8,
  minBorderMargin: 0.02,
  autoCapture: true,
}
/** How parallel the phone is to the page: 1 when opposite sides are equally long, lower the more it is tilted. */
export const parallelism = (quad: Quad) => {
  const ratio = (a: number, b: number) => Math.min(a, b) / Math.max(a, b, 1e-6)

  return Math.min(ratio(distance(quad[0], quad[1]), distance(quad[3], quad[2])), ratio(distance(quad[0], quad[3]), distance(quad[1], quad[2])))
}
const lerpQuad = (from: Quad, to: Quad, t: number) => from.map((p, i) => ({ x: p.x + (to[i]!.x - p.x) * t, y: p.y + (to[i]!.y - p.y) * t })) as Quad
/**
 * Turns noisy per-frame detections into a stable outline and decides when to capture: the document must be seen
 * with confidence, look like a sheet, and hold still (all four corners, not just its area) for `captureAfterMs`.
 * After a capture it waits for a fresh target, so one page is never captured twice.
 */
export class DocumentTracker {
  private quad?: Quad
  private lastRaw?: Quad
  private lastSeen = 0
  private steadySince?: number
  /** Where the document was when the countdown started; drift is measured against it, independent of the frame rate. */
  private anchor?: Quad
  /** Sharpest frame since the countdown started; autofocus is settled when the current frame comes close to it. */
  private peakSharpness = 0
  private armed = true
  private capturedQuad?: Quad
  constructor(private frame: Size, private readonly options: TrackerOptions = DEFAULT_TRACKER_OPTIONS) { }
  private get diagonal() {
    return Math.hypot(this.frame.width, this.frame.height)
  }
  setFrame(frame: Size) {
    if (frame.width === this.frame.width && frame.height === this.frame.height)
      return

    this.frame = frame

    this.reset()
  }
  setAutoCapture(enabled: boolean) {
    this.options.autoCapture = enabled
  }
  reset() {
    this.quad = undefined

    this.lastRaw = undefined

    this.anchor = undefined

    this.steadySince = undefined

    this.lastSeen = 0
  }
  /** Call after every capture (manual or automatic), with the outline that was captured when it is known. */
  markCaptured(quad?: Quad) {
    this.armed = false

    this.capturedQuad = quad ?? this.lastRaw ?? this.quad

    this.steadySince = undefined
  }
  update(detection: Detection | undefined, now: number): TrackerState {
    const valid = detection && detection.confidence >= this.options.minConfidence && isPlausibleDocument(detection.quad, this.frame, { minAreaRatio: this.options.minAreaRatio, maxSideRatio: this.options.maxSideRatio })

    if (!valid)
      return this.miss(now)

    const raw = detection.quad

    const shift = this.anchor ? maxCornerShift(raw, this.anchor) / this.diagonal : Infinity

    const jump = this.quad ? maxCornerShift(raw, this.quad) / this.diagonal : Infinity

    this.quad = jump > this.options.jumpThreshold || !this.quad ? raw : lerpQuad(this.quad, raw, 0.6)

    this.lastRaw = raw

    this.lastSeen = now

    if (shift > this.options.steadyThreshold || this.steadySince === undefined) {
      this.steadySince = now

      this.anchor = raw

      this.peakSharpness = 0
    }

    const inFocus = this.focusSettled(detection.sharpness)

    if (!this.armed && this.capturedQuad && maxCornerShift(raw, this.capturedQuad) / this.diagonal > this.options.rearmShift) {
      this.rearm(now)
    }

    const steadyFor = now - this.steadySince

    const hint = this.hintFor(raw)

    const canCapture = this.armed && this.options.autoCapture && !hint

    return {
      status: steadyFor >= this.options.captureAfterMs / 3 ? 'steady' : 'tracking',
      quad: this.quad,
      progress: canCapture ? Math.min(1, steadyFor / this.options.captureAfterMs) : 0,
      shouldCapture: canCapture && steadyFor >= this.options.captureAfterMs && inFocus,
      hint,
    }
  }
  /** Autofocus has settled when the frame is close to the sharpest one seen since the countdown started. */
  private focusSettled(sharpness: number | undefined) {
    if (sharpness === undefined)
      return true

    this.peakSharpness = Math.max(this.peakSharpness, sharpness)

    return sharpness >= this.peakSharpness * this.options.focusRatio
  }
  private hintFor(quad: Quad): TrackerHint | undefined {
    const marginX = this.frame.width * this.options.minBorderMargin

    const marginY = this.frame.height * this.options.minBorderMargin

    const touchesBorder = quad.some((p) => p.x < marginX || p.y < marginY || p.x > this.frame.width - marginX || p.y > this.frame.height - marginY)

    if (touchesBorder)
      return 'too-close'

    if (parallelism(quad) < this.options.minParallelism)
      return 'tilted'

    return undefined
  }
  private rearm(now: number) {
    this.armed = true

    this.capturedQuad = undefined

    this.steadySince = now

    this.anchor = this.lastRaw
  }
  private miss(now: number): TrackerState {
    // A single dropped frame keeps the outline and the countdown; only a lasting loss resets them.

    if (this.quad && now - this.lastSeen <= this.options.lostAfterMs) {
      return { status: 'tracking', quad: this.quad, progress: 0, shouldCapture: false }
    }

    this.quad = undefined

    this.lastRaw = undefined

    this.anchor = undefined

    this.steadySince = undefined

    // The captured page left the frame: whatever shows up next is a new target.

    if (!this.armed) {
      this.armed = true

      this.capturedQuad = undefined
    }

    return { status: 'searching', progress: 0, shouldCapture: false }
  }
}
