import { describe, expect, it } from 'vitest'
import {
  decodeCornerHeatmaps,
  preprocessDocAlignerInput,
} from '../src/runtime/utils/model-contract'

const frame = (width: number, height: number, pixels: number[]) => ({
  width,
  height,
  data: new Uint8ClampedArray(pixels),
})

describe('DocAligner model contract', () => {
  it('converts browser RGBA pixels to normalized BGR CHW', () => {
    const result = preprocessDocAlignerInput(
      frame(1, 1, [10, 20, 30, 255]),
      1,
      1,
    )
    expect(result.dims).toEqual([1, 3, 1, 1])
    expect(result.data[0]).toBeCloseTo(30 / 255, 7)
    expect(result.data[1]).toBeCloseTo(20 / 255, 7)
    expect(result.data[2]).toBeCloseTo(10 / 255, 7)
  })

  it('uses bilinear resize instead of nearest-neighbor sampling', () => {
    const result = preprocessDocAlignerInput(
      frame(2, 1, [0, 0, 0, 255, 200, 100, 50, 255]),
      1,
      1,
    )
    expect(result.data[0]).toBeCloseTo(25 / 255, 6)
    expect(result.data[1]).toBeCloseTo(50 / 255, 6)
    expect(result.data[2]).toBeCloseTo(100 / 255, 6)
  })

  it('decodes the largest thresholded component and its confidence', () => {
    const heatmaps = new Float32Array(4 * 4 * 4)
    for (let corner = 0; corner < 4; corner++) {
      const offset = corner * 16
      heatmaps[offset + 5] = 0.7
      heatmaps[offset + 6] = 0.9
      heatmaps[offset + 9] = 0.8
      heatmaps[offset + 15] = 0.95
    }
    const result = decodeCornerHeatmaps({
      outputData: heatmaps,
      outputShape: [1, 4, 4, 4],
      imageWidth: 4,
      imageHeight: 4,
    })
    expect(result.corners).toBeDefined()
    expect(result.points).toHaveLength(4)
    expect(result.points[0]?.componentArea).toBe(3)
    expect(result.points[0]?.x).toBeCloseTo(4 / 3, 5)
    expect(result.points[0]?.y).toBeCloseTo(4 / 3, 5)
    expect(result.confidence).toBeGreaterThan(0.7)
  })

  it('returns no quad when one heatmap has no valid component', () => {
    const heatmaps = new Float32Array(4 * 4 * 4).fill(0.8)
    heatmaps.fill(0, 16, 32)
    const result = decodeCornerHeatmaps({
      outputData: heatmaps,
      outputShape: [1, 4, 4, 4],
      imageWidth: 4,
      imageHeight: 4,
    })
    expect(result.corners).toBeUndefined()
    expect(result.confidence).toBe(0)
    expect(result.points[1]).toBeUndefined()
  })
})
