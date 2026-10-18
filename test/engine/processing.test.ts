import { describe, expect, test } from 'vitest'
import { distance, solveHomography, applyHomography } from '../../src/runtime/engine/geometry'
import type { Quad } from '../../src/runtime/engine/geometry'
import { decodeHeatmaps } from '../../src/runtime/engine/heatmap'
import { enhanceDocument } from '../../src/runtime/engine/enhance'
import { createRgbaImage, rotateImage } from '../../src/runtime/engine/image'
import { refineQuad } from '../../src/runtime/engine/refine'
import { sharpnessScore } from '../../src/runtime/engine/sharpness'
import { noise, renderPage } from './testing'
import { warpPerspective } from '../../src/runtime/engine/warp'

const truth: Quad = [
  { x: 71.3, y: 58.6 },
  { x: 402.8, y: 80.2 },
  { x: 418.4, y: 560.7 },
  { x: 52.9, y: 531.1 },
]
const perturb = (quad: Quad, amount: number): Quad => {
  const offsets = [
    [amount, -amount],
    [-amount, amount * 0.6],
    [amount * 0.7, amount],
    [-amount * 0.8, -amount * 0.5],
  ]

  return quad.map((p, i) => ({ x: p.x + offsets[i]![0]!, y: p.y + offsets[i]![1]! })) as Quad
}
const maxError = (a: Quad, b: Quad) => Math.max(...a.map((p, i) => distance(p, b[i]!)))
describe('heatmap decoding', () => {
  test('recovers a peak between heatmap cells instead of snapping to the grid', () => {
    const size = 32

    const centers = [
      { x: 5.3, y: 7.8 },
      { x: 25.6, y: 4.2 },
      { x: 26.1, y: 27.5 },
      { x: 3.9, y: 29.3 },
    ]

    const data = new Float32Array(4 * size * size)

    centers.forEach((c, k) => {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++)
          data[k * size * size + y * size + x] = 0.9 * Math.exp(-((x + 0.5 - c.x) ** 2 + (y + 0.5 - c.y) ** 2) / 2)
      }
    })

    const { points, confidences } = decodeHeatmaps(data, 4, size, size)

    points.forEach((p, k) => {
      expect(Math.abs(p.x * size - centers[k]!.x)).toBeLessThan(0.15)

      expect(Math.abs(p.y * size - centers[k]!.y)).toBeLessThan(0.15)
    })

    for (const confidence of confidences)
      expect(confidence).toBeGreaterThan(0.8)
  })
})
describe('corner refinement', () => {
  const random = noise(42)

  const light = renderPage(480, 620, truth, () => 225 + random() * 12, (x, y) => 70 + ((x * 7 + y * 3) % 23) + random() * 12)

  test('snaps corners that are several pixels off onto the page borders', () => {
    const coarse = perturb(truth, 7)

    const { quad, refinedEdges } = refineQuad(light, coarse)

    expect(refinedEdges).toBe(4)

    expect(maxError(quad, truth)).toBeLessThan(0.8)

    expect(maxError(coarse, truth)).toBeGreaterThan(8)
  })

  test('also works for a dark page on a bright surface', () => {
    const dark = renderPage(480, 620, truth, () => 60, () => 200)

    const { quad, refinedEdges } = refineQuad(dark, perturb(truth, 6))

    expect(refinedEdges).toBe(4)

    expect(maxError(quad, truth)).toBeLessThan(0.8)
  })

  test('keeps the estimate when there is no edge to find', () => {
    const blank = renderPage(480, 620, truth, () => 128, () => 128)

    const coarse = perturb(truth, 6)

    const { quad, refinedEdges } = refineQuad(blank, coarse)

    expect(refinedEdges).toBe(0)

    expect(quad).toEqual(coarse)
  })
})
describe('perspective warp', () => {
  test('rectifies a page so that content lands where it was printed', () => {
    const size = { width: 300, height: 420 }

    const pattern = (u: number, v: number) => (Math.floor(u / 30) + Math.floor(v / 30)) % 2 ? 220 : 40

    const pageToFrame = solveHomography([
      { x: 0, y: 0 },
      { x: size.width, y: 0 },
      { x: size.width, y: size.height },
      { x: 0, y: size.height },
    ], truth)

    const frameToPage = solveHomography(truth, [
      { x: 0, y: 0 },
      { x: size.width, y: 0 },
      { x: size.width, y: size.height },
      { x: 0, y: size.height },
    ])

    expect(applyHomography(pageToFrame, { x: 0, y: 0 }).x).toBeCloseTo(truth[0].x, 6)

    const frame = renderPage(480, 620, truth, (x, y) => {
      const p = applyHomography(frameToPage, { x: x + 0.5, y: y + 0.5 })

      return pattern(p.x, p.y)
    }, () => 128)

    const page = warpPerspective(frame, truth, size)

    let mismatches = 0

    let checked = 0

    for (let v = 5; v < size.height - 5; v += 7) {
      for (let u = 5; u < size.width - 5; u += 7) {
        if (u % 30 < 4 || u % 30 > 26 || v % 30 < 4 || v % 30 > 26)
          continue

        checked++

        if (Math.abs(page.data[(v * size.width + u) * 4]! - pattern(u, v)) > 40)
          mismatches++
      }
    }

    expect(checked).toBeGreaterThan(500)

    expect(mismatches / checked).toBeLessThan(0.01)
  })
})
describe('page enhancement', () => {
  const lit = () => {
    // White paper with black ink blocks under light falling off from 245 to 120 across the page.

    const image = createRgbaImage(400, 560)

    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const light = 245 - (125 * x) / image.width

        const ink = x % 80 > 40 && y % 40 < 8

        const i = (y * image.width + x) * 4

        image.data[i] = ink ? light * 0.12 : light

        image.data[i + 1] = ink ? light * 0.12 : light * 0.97

        image.data[i + 2] = ink ? light * 0.12 : light * 0.9

        image.data[i + 3] = 255
      }
    }

    return image
  }

  test('evens out lighting and paper tint while keeping ink dark', () => {
    const image = enhanceDocument(lit(), 'enhanced')

    const at = (x: number, y: number) => Array.from(image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 3))

    for (const [x, y] of [
      [10, 20],
      [390, 20],
      [200, 300],
      [385, 540],
    ]) {
      for (const channel of at(x!, y!))
        expect(channel).toBeGreaterThan(240)
    }

    for (const channel of at(60, 3))
      expect(channel).toBeLessThan(40)

    for (const channel of at(380, 3))
      expect(channel).toBeLessThan(40)
  })

  test('black and white turns paper white and ink black on both sides of the page', () => {
    const image = enhanceDocument(lit(), 'bw')

    expect(image.data[(20 * image.width + 10) * 4]).toBe(255)

    expect(image.data[(20 * image.width + 390) * 4]).toBe(255)

    expect(image.data[(3 * image.width + 60) * 4]).toBe(0)

    expect(image.data[(3 * image.width + 380) * 4]).toBe(0)
  })
})
describe('image helpers', () => {
  test('rotating four times by 90° gives back the original', () => {
    const random = noise(3)

    const image = createRgbaImage(5, 3)

    for (let i = 0; i < image.data.length; i++)
      image.data[i] = Math.floor((random() + 0.5) * 255)

    let rotated = image

    for (let i = 0; i < 4; i++)
      rotated = rotateImage(rotated, 90)

    expect(Array.from(rotated.data)).toEqual(Array.from(image.data))

    const once = rotateImage(image, 90)

    expect([once.width, once.height]).toEqual([3, 5])

    // The top-left pixel ends up top-right after a clockwise turn.

    expect(Array.from(once.data.subarray(8, 12))).toEqual(Array.from(image.data.subarray(0, 4)))
  })

  test('a blurred frame scores lower than a sharp one', () => {
    const sharp = renderPage(200, 200, truth.map((p) => ({ x: p.x / 3, y: p.y / 3 })) as Quad, (x, y) => ((x >> 2) + (y >> 2)) % 2 ? 230 : 30, () => 90)

    const blurred = createRgbaImage(200, 200)

    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 200; x++) {
        let sum = 0

        for (let d = -3; d <= 3; d++)
          sum += sharp.data[(y * 200 + Math.min(199, Math.max(0, x + d))) * 4]!

        const i = (y * 200 + x) * 4

        blurred.data[i] = blurred.data[i + 1] = blurred.data[i + 2] = sum / 7

        blurred.data[i + 3] = 255
      }
    }

    expect(sharpnessScore(sharp)).toBeGreaterThan(sharpnessScore(blurred) * 3)
  })
})
