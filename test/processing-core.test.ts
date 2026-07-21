import { describe, expect, it } from 'vitest'
import {
  applyProcessingProfile,
  assessImageQuality,
  reduceNoise,
  resolveWarpSize,
  rotateImageData,
  warpPerspective,
} from '../src/runtime/utils/processing-core'

const pixels = (
  width: number,
  height: number,
  color: [number, number, number, number] = [255, 255, 255, 255],
) => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < data.length; index += 4) data.set(color, index)
  return { data, width, height, colorSpace: 'srgb' } as ImageData
}

describe('processing core', () => {
  it('preserves all four image edges while denoising', () => {
    const source = pixels(4, 4, [240, 240, 240, 255])
    const result = reduceNoise(source)
    for (let index = 0; index < result.data.length; index += 4) {
      expect(result.data[index]).toBe(240)
      expect(result.data[index + 3]).toBe(255)
    }
  })

  it('warps the requested quad and keeps corner colors', () => {
    const source = pixels(4, 4, [0, 0, 0, 255])
    const set = (x: number, y: number, color: number[]) => {
      source.data.set(color, (y * source.width + x) * 4)
    }
    set(0, 0, [255, 0, 0, 255])
    set(3, 0, [0, 255, 0, 255])
    set(3, 3, [0, 0, 255, 255])
    set(0, 3, [255, 255, 0, 255])
    const result = warpPerspective(source, [0, 0, 3, 0, 3, 3, 0, 3])!
    expect(result.width).toBe(3)
    expect(result.height).toBe(3)
    expect(Array.from(result.data.slice(0, 3))).toEqual([255, 0, 0])
    expect(Array.from(result.data.slice(8 * 4, 8 * 4 + 3))).toEqual([0, 0, 255])
  })

  it('enforces the configured pixel budget without changing aspect ratio', () => {
    const size = resolveWarpSize(
      [0, 0, 4000, 0, 4000, 2000, 0, 2000],
      2_000_000,
      4000,
    )!
    expect(size.width * size.height).toBeLessThanOrEqual(2_010_000)
    expect(size.width / size.height).toBeCloseTo(2, 2)
  })

  it('keeps chroma in the default document profile', () => {
    const source = pixels(5, 5, [180, 80, 30, 255])
    const result = applyProcessingProfile(source, 'document')
    expect(result.data[0]).toBeGreaterThan(result.data[1]!)
    expect(result.data[1]).toBeGreaterThan(result.data[2]!)
  })

  it('reports actionable quality warnings', () => {
    const dark = pixels(20, 20, [4, 4, 4, 255])
    const quality = assessImageQuality(dark, {
      coverage: 0.1,
      quadConfidence: 0.2,
      motion: 0.08,
    })
    expect(quality.acceptableForAutoCapture).toBe(false)
    expect(quality.warnings).toEqual(
      expect.arrayContaining(['move-closer', 'hold-still', 'too-dark', 'corners-missing']),
    )
  })

  it('rotates pixels and dimensions in 90 degree increments', () => {
    const source = pixels(2, 3, [1, 2, 3, 255])
    const result = rotateImageData(source, 90)
    expect(result.width).toBe(3)
    expect(result.height).toBe(2)
  })
})
