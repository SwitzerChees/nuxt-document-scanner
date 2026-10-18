import { describe, expect, test } from 'vitest'
import type { Quad } from '../../src/runtime/engine/geometry'
import { DEFAULT_TRACKER_OPTIONS, DocumentTracker, parallelism } from '../../src/runtime/engine/tracker'

const frame = { width: 1080, height: 1920 }
const page: Quad = [
  { x: 150, y: 300 },
  { x: 930, y: 320 },
  { x: 960, y: 1500 },
  { x: 120, y: 1480 },
]
const shifted = (quad: Quad, dx: number, dy = 0) => quad.map((p) => ({ x: p.x + dx, y: p.y + dy })) as Quad
const jitter = (quad: Quad, t: number) => quad.map((p, i) => ({ x: p.x + Math.sin(t + i) * 3, y: p.y + Math.cos(t * 1.3 + i) * 3 })) as Quad
/** Feeds detections every 100ms and returns the time of the first automatic capture. */
const run = (tracker: DocumentTracker, from: number, until: number, quadAt: (t: number) => Quad | undefined, confidence = 0.9) => {
  for (let t = from; t <= until; t += 100) {
    const quad = quadAt(t)

    const state = tracker.update(quad ? { quad, confidence } : undefined, t)

    if (state.shouldCapture)
      return t
  }

  return undefined
}
describe('document tracker', () => {
  test('captures a document held still, even with detection jitter', () => {
    const tracker = new DocumentTracker(frame, { ...DEFAULT_TRACKER_OPTIONS })

    const capturedAt = run(tracker, 0, 3000, (t) => jitter(page, t))

    expect(capturedAt).toBeDefined()

    expect(capturedAt!).toBeLessThanOrEqual(1300)
  })

  test('does not capture while the document slides sideways at constant size', () => {
    const tracker = new DocumentTracker(frame, { ...DEFAULT_TRACKER_OPTIONS })

    expect(run(tracker, 0, 3000, (t) => shifted(page, t / 20))).toBeUndefined()
  })

  test('ignores low-confidence detections and implausible shapes', () => {
    const tracker = new DocumentTracker(frame, { ...DEFAULT_TRACKER_OPTIONS })

    expect(run(tracker, 0, 3000, () => page, 0.3)).toBeUndefined()

    const sliver: Quad = [
      { x: 100, y: 900 },
      { x: 1000, y: 900 },
      { x: 1000, y: 960 },
      { x: 100, y: 960 },
    ]

    expect(run(tracker, 3100, 6000, () => sliver)).toBeUndefined()
  })

  test('a single dropped detection neither hides the outline nor restarts the countdown', () => {
    const tracker = new DocumentTracker(frame, { ...DEFAULT_TRACKER_OPTIONS })

    const capturedAt = run(tracker, 0, 3000, (t) => (t === 500 ? undefined : page))

    expect(capturedAt).toBeLessThanOrEqual(1300)
  })

  test('waits for a new page after a capture', () => {
    const tracker = new DocumentTracker(frame, { ...DEFAULT_TRACKER_OPTIONS })

    run(tracker, 0, 3000, () => page)

    tracker.markCaptured()

    // Same page, still in place: no second capture.

    expect(run(tracker, 3100, 7000, () => page)).toBeUndefined()

    // The page is taken away and the next one put down.

    expect(run(tracker, 7100, 7800, () => undefined)).toBeUndefined()

    expect(run(tracker, 7900, 10000, () => page)).toBeDefined()
  })

  test('a document moved to a clearly different spot counts as a new target', () => {
    const tracker = new DocumentTracker(frame, { ...DEFAULT_TRACKER_OPTIONS })

    run(tracker, 0, 3000, () => page)

    tracker.markCaptured()

    expect(run(tracker, 3100, 6000, () => shifted(page, 0, 350))).toBeDefined()
  })

  test('waits for autofocus to settle before capturing', () => {
    const tracker = new DocumentTracker(frame, { ...DEFAULT_TRACKER_OPTIONS })

    // Focus hunts: sharp early on, blurry from 900ms to 1800ms, sharp again afterwards.

    const sharpnessAt = (t: number) => (t >= 900 && t < 1800 ? 40 : 100)

    let capturedAt: number | undefined

    for (let t = 0; t <= 4000 && capturedAt === undefined; t += 100) {
      if (tracker.update({ quad: page, confidence: 0.9, sharpness: sharpnessAt(t) }, t).shouldCapture)
        capturedAt = t
    }

    expect(capturedAt).toBe(1800)
  })

  test('asks to hold the phone parallel instead of capturing a steeply tilted page', () => {
    const tracker = new DocumentTracker(frame, { ...DEFAULT_TRACKER_OPTIONS })

    // Seen from a steep angle: the far (top) edge is much shorter than the near one.

    const tilted: Quad = [
      { x: 330, y: 400 },
      { x: 750, y: 400 },
      { x: 960, y: 1500 },
      { x: 120, y: 1500 },
    ]

    expect(run(tracker, 0, 3000, () => tilted)).toBeUndefined()

    expect(tracker.update({ quad: tilted, confidence: 0.9 }, 3100).hint).toBe('tilted')

    expect(parallelism(page)).toBeGreaterThan(0.9)
  })

  test('asks to move back when the page reaches the frame border', () => {
    const tracker = new DocumentTracker(frame, { ...DEFAULT_TRACKER_OPTIONS })

    const filling: Quad = [
      { x: 5, y: 300 },
      { x: 1075, y: 300 },
      { x: 1075, y: 1800 },
      { x: 5, y: 1800 },
    ]

    expect(run(tracker, 0, 3000, () => filling)).toBeUndefined()

    expect(tracker.update({ quad: filling, confidence: 0.9 }, 3100).hint).toBe('too-close')
  })

  test('manual mode never captures by itself', () => {
    const tracker = new DocumentTracker(frame, { ...DEFAULT_TRACKER_OPTIONS, autoCapture: false })

    expect(run(tracker, 0, 3000, () => page)).toBeUndefined()
  })
})

test('respects the host module limits for long receipts', () => {
  const receipt: Quad = [{ x: 200, y: 100 }, { x: 350, y: 100 }, { x: 350, y: 1600 }, { x: 200, y: 1600 }]
  const tracker = new DocumentTracker(frame, { ...DEFAULT_TRACKER_OPTIONS, maxSideRatio: 12 })
  expect(run(tracker, 0, 3000, () => receipt)).toBeDefined()
})
