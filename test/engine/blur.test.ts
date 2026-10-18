import { describe, expect, test } from 'vitest'
import type { Quad } from '../../src/runtime/engine/geometry'
import { createRgbaImage } from '../../src/runtime/engine/image'
import { BLUR_THRESHOLD, blurScore } from '../../src/runtime/engine/sharpness'
import { renderPage } from './testing'
/** A text-like page: rows of dark "glyph" blocks 3px wide on paper, like print at ~1400px page height. */
const textPage = () => renderPage(700, 990, [
  { x: 0, y: 0 },
  { x: 700, y: 0 },
  { x: 700, y: 990 },
  { x: 0, y: 990 },
] as Quad, (x, y) => (y % 34 < 14 && x > 60 && x < 640 && (x % 11 < 3 || x % 23 < 2 || (y % 34) % 7 < 2) && (Math.floor(x / 90) + Math.floor(y / 34)) % 5 ? 30 : 238), () => 238)
const gaussianBlur = (image: ReturnType<typeof createRgbaImage>, sigma: number) => {
  const radius = Math.ceil(sigma * 3)

  const kernel = Array.from({ length: 2 * radius + 1 }, (_, i) => Math.exp(-((i - radius) ** 2) / (2 * sigma * sigma)))

  const total = kernel.reduce((a, b) => a + b, 0)

  const pass = (src: Uint8ClampedArray, horizontal: boolean) => {
    const out = new Uint8ClampedArray(src.length)

    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        let acc = 0

        for (let k = -radius; k <= radius; k++) {
          const sx = horizontal ? Math.min(image.width - 1, Math.max(0, x + k)) : x

          const sy = horizontal ? y : Math.min(image.height - 1, Math.max(0, y + k))

          acc += src[(sy * image.width + sx) * 4]! * kernel[k + radius]!
        }

        const i = (y * image.width + x) * 4

        out[i] = out[i + 1] = out[i + 2] = acc / total

        out[i + 3] = 255
      }
    }

    return out
  }

  return { ...image, data: pass(pass(image.data, true), false) }
}
describe('blur check', () => {
  test('a crisp page passes, a clearly out-of-focus one is flagged, and the score grows with blur', () => {
    const page = textPage()

    const sharp = blurScore(page)!

    const soft = blurScore(gaussianBlur(page, 1.2))!

    const blurred = blurScore(gaussianBlur(page, 3))!

    expect(sharp).toBeLessThan(BLUR_THRESHOLD)

    expect(blurred).toBeGreaterThan(BLUR_THRESHOLD)

    expect(sharp).toBeLessThan(soft)

    expect(soft).toBeLessThan(blurred)
  })

  test('a blank sheet is not judged at all', () => {
    const blank = createRgbaImage(300, 400)

    blank.data.fill(238)

    expect(blurScore(blank)).toBeUndefined()
  })
})
