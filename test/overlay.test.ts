import { describe, expect, it } from 'vitest'
import { resolveVideoDisplayArea } from '../src/runtime/utils/overlay'
import {
  resolveCenteredAspectCrop,
  resolvePreferredVideoSize,
} from '../src/runtime/composables/useStream'

describe('video overlay geometry', () => {
  it('matches object-fit cover for a wide camera frame in a portrait viewport', () => {
    const area = resolveVideoDisplayArea(1920, 1080, 360, 640, 'cover')

    expect(area.displayHeight).toBe(640)
    expect(area.displayWidth).toBeCloseTo(1137.78, 2)
    expect(area.offsetX).toBeLessThan(0)
    expect(area.offsetY).toBe(0)
  })

  it('matches object-fit cover for a tall camera frame in a wider viewport', () => {
    const area = resolveVideoDisplayArea(1080, 1920, 420, 560, 'cover')

    expect(area.displayWidth).toBe(420)
    expect(area.displayHeight).toBeCloseTo(746.67, 2)
    expect(area.offsetX).toBe(0)
    expect(area.offsetY).toBeLessThan(0)
  })

  it('keeps contain mode available for hosts that override scanner video CSS', () => {
    const area = resolveVideoDisplayArea(1920, 1080, 360, 640, 'contain')

    expect(area.displayWidth).toBe(360)
    expect(area.displayHeight).toBeCloseTo(202.5, 2)
    expect(area.offsetX).toBe(0)
    expect(area.offsetY).toBeCloseTo(218.75, 2)
  })
})

describe('camera stream sizing', () => {
  it('uses common high-resolution portrait camera proportions', () => {
    expect(resolvePreferredVideoSize(1920, true)).toEqual({
      width: 1080,
      height: 1920,
    })
  })

  it('uses common high-resolution landscape camera proportions', () => {
    expect(resolvePreferredVideoSize(1920, false)).toEqual({
      width: 1920,
      height: 1080,
    })
  })

  it('center-crops high-resolution stills to the live preview aspect', () => {
    const crop = resolveCenteredAspectCrop(3000, 4000, 9 / 16)

    expect(crop.sx).toBeCloseTo(375, 2)
    expect(crop.sy).toBe(0)
    expect(crop.sWidth).toBeCloseTo(2250, 2)
    expect(crop.sHeight).toBe(4000)
  })
})
