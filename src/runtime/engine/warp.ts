import { solveHomography } from './geometry'
import type { Quad, Size } from './geometry'
import { createRgbaImage } from './image'
import type { RgbaImage } from './image'
/**
 * Rectifies the quad into an upright `size` image with bilinear sampling. Each output pixel centre is mapped back
 * through the homography, so the result has no holes and no dependency on OpenCV.
 */
export const warpPerspective = (source: RgbaImage, quad: Quad, size: Size): RgbaImage => {
  const { width, height } = size

  const out = createRgbaImage(width, height)

  const h = solveHomography([
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ], quad)

  const src = source.data

  const sw = source.width

  const sh = source.height

  const maxX = sw - 1

  const maxY = sh - 1

  const dst = out.data

  let o = 0

  for (let y = 0; y < height; y++) {
    const cy = y + 0.5

    // Numerators and denominator are affine in x, so they advance by a constant per pixel.

    let nx = h[0]! * 0.5 + h[1]! * cy + h[2]!

    let ny = h[3]! * 0.5 + h[4]! * cy + h[5]!

    let nw = h[6]! * 0.5 + h[7]! * cy + h[8]!

    for (let x = 0; x < width; x++) {
      let fx = nx / nw - 0.5

      let fy = ny / nw - 0.5

      fx = fx < 0 ? 0 : fx > maxX ? maxX : fx

      fy = fy < 0 ? 0 : fy > maxY ? maxY : fy

      const x0 = fx | 0

      const y0 = fy | 0

      const ax = fx - x0

      const ay = fy - y0

      const x1 = x0 < maxX ? x0 + 1 : x0

      const y1 = y0 < maxY ? y0 + 1 : y0

      const i00 = (y0 * sw + x0) * 4

      const i10 = (y0 * sw + x1) * 4

      const i01 = (y1 * sw + x0) * 4

      const i11 = (y1 * sw + x1) * 4

      const w00 = (1 - ax) * (1 - ay)

      const w10 = ax * (1 - ay)

      const w01 = (1 - ax) * ay

      const w11 = ax * ay

      dst[o] = src[i00]! * w00 + src[i10]! * w10 + src[i01]! * w01 + src[i11]! * w11

      dst[o + 1] = src[i00 + 1]! * w00 + src[i10 + 1]! * w10 + src[i01 + 1]! * w01 + src[i11 + 1]! * w11

      dst[o + 2] = src[i00 + 2]! * w00 + src[i10 + 2]! * w10 + src[i01 + 2]! * w01 + src[i11 + 2]! * w11

      dst[o + 3] = 255

      o += 4

      nx += h[0]!

      ny += h[3]!

      nw += h[6]!
    }
  }

  return out
}
