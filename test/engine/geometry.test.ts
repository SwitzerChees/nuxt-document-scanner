import { describe, expect, test } from 'vitest'
import { applyHomography, cornerAngles, isConvex, isPlausibleDocument, orderQuad, quadArea, rectifiedSize, solveHomography } from '../../src/runtime/engine/geometry'
import type { Quad } from '../../src/runtime/engine/geometry'

const page: Quad = [
  { x: 120, y: 90 },
  { x: 860, y: 140 },
  { x: 900, y: 1500 },
  { x: 80, y: 1430 },
]
describe('document geometry', () => {
  test('orders shuffled corners as top-left, top-right, bottom-right, bottom-left', () => {
    expect(orderQuad([page[2], page[0], page[3], page[1]])).toEqual(page)

    expect(orderQuad([page[3], page[2], page[1], page[0]])).toEqual(page)
  })

  test('a homography maps each corner onto its target', () => {
    const rect: Quad = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1414 },
      { x: 0, y: 1414 },
    ]

    const h = solveHomography(rect, page)

    rect.forEach((corner, i) => {
      const mapped = applyHomography(h, corner)

      expect(mapped.x).toBeCloseTo(page[i]!.x, 6)

      expect(mapped.y).toBeCloseTo(page[i]!.y, 6)
    })
  })

  test('accepts a sheet under perspective and rejects shapes that cannot be one', () => {
    const frame = { width: 1080, height: 1920 }

    expect(isPlausibleDocument(page, frame)).toBe(true)

    const concave: Quad = [page[0], { x: 300, y: 700 }, page[2], page[3]]

    expect(isConvex(concave)).toBe(false)

    expect(isPlausibleDocument(concave, frame)).toBe(false)

    const tiny: Quad = [
      { x: 10, y: 10 },
      { x: 60, y: 10 },
      { x: 60, y: 80 },
      { x: 10, y: 80 },
    ]

    expect(isPlausibleDocument(tiny, frame)).toBe(false)

    const sliver: Quad = [
      { x: 100, y: 100 },
      { x: 1000, y: 100 },
      { x: 1000, y: 160 },
      { x: 100, y: 160 },
    ]

    expect(isPlausibleDocument(sliver, frame)).toBe(false)
  })

  test('measures area, angles and the rectified output size', () => {
    const square: Quad = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]

    expect(quadArea(square)).toBe(10000)

    for (const angle of cornerAngles(square))
      expect(angle).toBeCloseTo(90, 6)

    expect(rectifiedSize(page, 10000)).toEqual({ width: 823, height: 1361 })

    const capped = rectifiedSize(page, 680)

    expect(Math.max(capped.width, capped.height)).toBe(680)
  })
})
