import { describe, expect, it } from 'vitest'
import {
  cornerNormalizedMeanError,
  evaluateQuad,
  polygonIntersectionOverUnion,
} from '../src/runtime/utils/quality-metrics'

describe('quality metrics', () => {
  const reference = [20, 20, 180, 30, 170, 180, 30, 170]

  it('reports perfect overlap for identical quads', () => {
    expect(cornerNormalizedMeanError(reference, reference, 200, 200)).toBe(0)
    expect(polygonIntersectionOverUnion(reference, reference)).toBeCloseTo(1, 8)
  })

  it('normalizes corner error against the image diagonal', () => {
    const shifted = reference.map((value, index) => value + (index % 2 === 0 ? 2 : 0))
    expect(cornerNormalizedMeanError(shifted, reference, 200, 200)).toBeCloseTo(
      2 / Math.hypot(200, 200),
      8,
    )
  })

  it('reports partial overlap and rejects disjoint quads', () => {
    const shifted = [100, 20, 260, 30, 250, 180, 110, 170]
    const disjoint = reference.map((value, index) => value + (index % 2 === 0 ? 400 : 0))
    expect(polygonIntersectionOverUnion(reference, shifted)).toBeGreaterThan(0)
    expect(polygonIntersectionOverUnion(reference, shifted)).toBeLessThan(1)
    expect(polygonIntersectionOverUnion(reference, disjoint)).toBe(0)
  })

  it('returns a stable evaluation record', () => {
    expect(evaluateQuad(reference, reference, 200, 200)).toEqual({
      cornerNme: 0,
      polygonIou: 1,
    })
  })
})
