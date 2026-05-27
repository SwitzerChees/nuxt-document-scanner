import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAutoCapture } from '../src/runtime/composables/useAutoCapture'

describe('auto capture timing', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not start a new countdown while waiting for a fresh target', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    const capture = useAutoCapture({
      enabled: true,
      delay: 1000,
      cooldown: 2000,
    })

    capture.requireFreshTarget(true)
    vi.advanceTimersByTime(2500)
    capture.updateProgress(true)

    expect(capture.canAutoCapture()).toBe(false)
    expect(capture.progress.value).toBe(0)

    capture.updateProgress(false)
    vi.advanceTimersByTime(800)
    capture.updateProgress(false)
    capture.updateProgress(true)
    vi.advanceTimersByTime(1000)
    capture.updateProgress(true)

    expect(capture.canAutoCapture()).toBe(true)
  })

  it('starts cooldown after capture processing instead of consuming it upfront', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    const capture = useAutoCapture({
      enabled: true,
      delay: 1000,
      cooldown: 2000,
    })

    vi.advanceTimersByTime(10)
    capture.updateProgress(true)
    vi.advanceTimersByTime(1000)
    capture.updateProgress(true)
    expect(capture.canAutoCapture()).toBe(true)

    capture.reset(false)
    vi.advanceTimersByTime(1500)
    capture.requireFreshTarget(true)

    capture.updateProgress(false)
    vi.advanceTimersByTime(800)
    capture.updateProgress(false)
    vi.advanceTimersByTime(1200)
    capture.updateProgress(true)

    expect(capture.canAutoCapture()).toBe(false)
    vi.advanceTimersByTime(1000)
    capture.updateProgress(true)
    expect(capture.canAutoCapture()).toBe(true)
  })
})
