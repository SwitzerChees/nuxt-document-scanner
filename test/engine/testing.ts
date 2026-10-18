import type { Point, Quad } from '../../src/runtime/engine/geometry'
import { createRgbaImage } from '../../src/runtime/engine/image'

const insideConvex = (quad: Quad, p: Point) => {
  let sign = 0

  for (let i = 0; i < 4; i++) {
    const a = quad[i]!

    const b = quad[(i + 1) % 4]!

    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)

    if (cross === 0)
      continue

    if (sign === 0)
      sign = Math.sign(cross)
    else if (Math.sign(cross) !== sign)
      return false
  }

  return true
}
type Shade = (x: number, y: number) => number
/**
 * Test fixture: a grey page drawn into a frame with 4x4 supersampled (anti-aliased) edges, like a camera would.
 */
export const renderPage = (width: number, height: number, quad: Quad, page: Shade, background: Shade) => {
  const image = createRgbaImage(width, height)

  const n = 4

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let coverage = 0

      for (let sy = 0; sy < n; sy++)
        for (let sx = 0; sx < n; sx++)
          if (insideConvex(quad, { x: x + (sx + 0.5) / n, y: y + (sy + 0.5) / n }))
            coverage++

      const a = coverage / (n * n)

      const v = page(x, y) * a + background(x, y) * (1 - a)

      const i = (y * width + x) * 4

      image.data[i] = image.data[i + 1] = image.data[i + 2] = v

      image.data[i + 3] = 255
    }
  }

  return image
}
/** Deterministic pseudo-random noise, so fixtures are reproducible. */
export const noise = (seed: number) => {
  let state = seed

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0

    return state / 2 ** 32 - 0.5
  }
}
