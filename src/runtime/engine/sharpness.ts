import { luma } from './image'
import type { RgbaImage } from './image'

export type Region = {
  x: number;
  y: number;
  width: number;
  height: number;
}
/**
 * Variance of the Laplacian over a region: high for crisp text, low for motion or focus blur.
 * Only meaningful for comparing frames of the same scene (e.g. picking the best of a burst).
 */
export const sharpnessScore = (image: RgbaImage, region: Region = { x: 0, y: 0, width: image.width, height: image.height }, step = 2) => {
  const { data, width } = image

  const x0 = Math.max(step, Math.floor(region.x))

  const y0 = Math.max(step, Math.floor(region.y))

  const x1 = Math.min(image.width - step - 1, Math.floor(region.x + region.width))

  const y1 = Math.min(image.height - step - 1, Math.floor(region.y + region.height))

  const at = (x: number, y: number) => {
    const i = (y * width + x) * 4

    return luma(data[i]!, data[i + 1]!, data[i + 2]!)
  }

  let sum = 0

  let sumSquares = 0

  let count = 0

  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      const laplacian = at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1) - 4 * at(x, y)

      sum += laplacian

      sumSquares += laplacian * laplacian

      count++
    }
  }

  if (!count)
    return 0

  const mean = sum / count

  return sumSquares / count - mean * mean
}
/** Pages scoring above this are flagged as likely blurry (calibrated on rendered text: ~0.41 at σ1.8, ~0.52 at σ3.5). */
export const BLUR_THRESHOLD = 0.46
/** Mean luminance step between neighbours below which a page has too little content to judge (e.g. a blank sheet). */
const MIN_CONTENT = 2
/**
 * Blur estimate after Crete et al. ("The blur effect", 2007): how much the neighbour differences shrink when the
 * image is blurred once more. A sharp image loses a lot, an already blurred one hardly anything. Normalised by the
 * image's own contrast, so light and dark pages compare. 0 = sharp … 1 = fully blurred; `undefined` when the page has
 * too little content to judge. Expects the page at roughly 1400 px on its long edge.
 */
export const blurScore = (image: RgbaImage): number | undefined => {
  const { data, width, height } = image

  const gray = new Float32Array(width * height)

  for (let i = 0, p = 0; p < gray.length; i += 4, p++)
    gray[p] = luma(data[i]!, data[i + 1]!, data[i + 2]!)

  const radius = 4

  const along = (horizontal: boolean) => {
    let sumSharp = 0

    let sumLoss = 0

    let count = 0

    const outer = horizontal ? height : width

    const inner = horizontal ? width : height

    const at = (o: number, i: number) => gray[horizontal ? o * width + i : i * width + o]!

    const line = new Float32Array(inner)

    for (let o = 0; o < outer; o++) {
      // Running 9-tap box blur along the line.

      let acc = 0

      for (let i = -radius; i <= radius; i++)
        acc += at(o, Math.min(inner - 1, Math.max(0, i)))

      for (let i = 0; i < inner; i++) {
        line[i] = acc / (2 * radius + 1)

        acc += at(o, Math.min(inner - 1, i + radius + 1)) - at(o, Math.max(0, i - radius))
      }

      for (let i = 1; i < inner; i++) {
        const sharp = Math.abs(at(o, i) - at(o, i - 1))

        const blurred = Math.abs(line[i]! - line[i - 1]!)

        sumSharp += sharp

        sumLoss += Math.max(0, sharp - blurred)

        count++
      }
    }

    return { score: sumSharp > 0 ? (sumSharp - sumLoss) / sumSharp : 1, content: count ? sumSharp / count : 0 }
  }

  const h = along(true)

  const v = along(false)

  if (Math.max(h.content, v.content) < MIN_CONTENT)
    return undefined

  return Math.max(h.score, v.score)
}
