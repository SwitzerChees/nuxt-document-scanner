import { luma } from './image'
import type { RgbaImage } from './image'
/**
 * - `enhanced`: colour kept, uneven lighting and paper tint removed, ink darkened (default; best for extraction).
 * - `grayscale`: the same, without colour.
 * - `bw`: soft-thresholded black and white, for faint or low-contrast print.
 * - `original`: the rectified photo untouched.
 */
export type FilterMode = 'enhanced' | 'grayscale' | 'bw' | 'original'
export const FILTER_MODES: FilterMode[] = ['enhanced', 'grayscale', 'bw', 'original']
type Grid = {
  values: Float32Array;
  columns: number;
  rows: number;
  blockSize: number;
}
const PAPER_PERCENTILE = 0.9
const MIN_BACKGROUND = 48
const INK_LEVEL = 28
const PAPER_LEVEL = 240
/** A high percentile of one channel per block: the paper brightness under the local lighting, ignoring ink. */
const blockBackground = (image: RgbaImage, channel: number, blockSize: number): Grid => {
  const { data, width, height } = image

  const columns = Math.ceil(width / blockSize)

  const rows = Math.ceil(height / blockSize)

  const values = new Float32Array(columns * rows)

  const histogram = new Uint32Array(64)

  const step = blockSize >= 16 ? 2 : 1

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < columns; gx++) {
      histogram.fill(0)

      let count = 0

      const yEnd = Math.min(height, (gy + 1) * blockSize)

      const xEnd = Math.min(width, (gx + 1) * blockSize)

      for (let y = gy * blockSize; y < yEnd; y += step) {
        for (let x = gx * blockSize; x < xEnd; x += step) {
          const i = (y * width + x) * 4

          const value = channel < 3 ? data[i + channel]! : luma(data[i]!, data[i + 1]!, data[i + 2]!)

          histogram[value >> 2]!++

          count++
        }
      }

      let target = count * PAPER_PERCENTILE

      let bin = 0

      while (bin < 63 && target > histogram[bin]!)
        target -= histogram[bin++]!

      values[gy * columns + gx] = bin * 4 + 2
    }
  }

  return { values, columns, rows, blockSize }
}
/** Grey-level closing (3x3 max) bridges dark regions such as photos or bold headings, then a 3x3 box blur twice. */
const smoothGrid = (grid: Grid) => {
  const { columns, rows } = grid

  const filter = (source: Float32Array, reduce: (values: number[]) => number) => {
    const out = new Float32Array(source.length)

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const neighbours: number[] = []

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = Math.min(columns - 1, Math.max(0, x + dx))

            const ny = Math.min(rows - 1, Math.max(0, y + dy))

            neighbours.push(source[ny * columns + nx]!)
          }
        }

        out[y * columns + x] = reduce(neighbours)
      }
    }

    return out
  }

  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length

  let values = filter(grid.values, (v) => Math.max(...v))

  values = filter(values, mean)

  values = filter(values, mean)

  for (let i = 0; i < values.length; i++)
    values[i] = Math.max(MIN_BACKGROUND, values[i]!)

  grid.values = values

  return grid
}
/** Calls `visit(x, y, i, backgrounds)` for each pixel with the bilinearly interpolated background of every grid. */
const forEachWithBackground = (image: RgbaImage, grids: Grid[], visit: (i: number, backgrounds: Float32Array) => void) => {
  const { width, height } = image

  const { columns, rows, blockSize } = grids[0]!

  const x0 = new Int32Array(width)

  const x1 = new Int32Array(width)

  const ax = new Float32Array(width)

  for (let x = 0; x < width; x++) {
    const g = Math.min(columns - 1, Math.max(0, (x + 0.5) / blockSize - 0.5))

    x0[x] = Math.floor(g)

    x1[x] = Math.min(columns - 1, x0[x]! + 1)

    ax[x] = g - x0[x]!
  }

  const rowValues = grids.map(() => new Float32Array(columns))

  const backgrounds = new Float32Array(grids.length)

  for (let y = 0; y < height; y++) {
    const g = Math.min(rows - 1, Math.max(0, (y + 0.5) / blockSize - 0.5))

    const y0 = Math.floor(g)

    const y1 = Math.min(rows - 1, y0 + 1)

    const ay = g - y0

    grids.forEach((grid, k) => {
      for (let c = 0; c < columns; c++)
        rowValues[k]![c] = grid.values[y0 * columns + c]! * (1 - ay) + grid.values[y1 * columns + c]! * ay
    })

    for (let x = 0; x < width; x++) {
      for (let k = 0; k < grids.length; k++) {
        const row = rowValues[k]!

        backgrounds[k] = row[x0[x]!]! * (1 - ax[x]!) + row[x1[x]!]! * ax[x]!
      }

      visit((y * width + x) * 4, backgrounds)
    }
  }
}
const levels = (value: number) => {
  const v = ((value - INK_LEVEL) * 255) / (PAPER_LEVEL - INK_LEVEL)

  return v < 0 ? 0 : v > 255 ? 255 : v
}
/** Otsu's threshold on a luminance histogram, clamped so pages with almost no ink still come out white. */
const otsuThreshold = (histogram: Uint32Array, total: number) => {
  let sumAll = 0

  for (let i = 0; i < 256; i++)
    sumAll += i * histogram[i]!

  let sumBackground = 0

  let weightBackground = 0

  let best = 0

  let threshold = 160

  for (let t = 0; t < 256; t++) {
    weightBackground += histogram[t]!

    if (!weightBackground)
      continue

    const weightForeground = total - weightBackground

    if (!weightForeground)
      break

    sumBackground += t * histogram[t]!

    const meanBackground = sumBackground / weightBackground

    const meanForeground = (sumAll - sumBackground) / weightForeground

    const between = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2

    if (between > best) {
      best = between

      threshold = t
    }
  }

  return Math.min(215, Math.max(110, threshold))
}
const binarize = (image: RgbaImage) => {
  const { data } = image

  const histogram = new Uint32Array(256)

  for (let i = 0; i < data.length; i += 4)
    histogram[data[i]!]!++

  const threshold = otsuThreshold(histogram, data.length / 4)

  // A narrow ramp instead of a hard cut keeps glyph edges anti-aliased, which OCR prefers.

  const ramp = 14

  for (let i = 0; i < data.length; i += 4) {
    const v = ((data[i]! - (threshold - ramp)) * 255) / (2 * ramp)

    data[i] = data[i + 1] = data[i + 2] = v < 0 ? 0 : v > 255 ? 255 : v
  }
}
/** Applies the filter in place and returns the same image. */
export const enhanceDocument = (image: RgbaImage, mode: FilterMode): RgbaImage => {
  if (mode === 'original')
    return image

  const blockSize = Math.max(8, Math.round(Math.max(image.width, image.height) / 48))

  const { data } = image

  if (mode === 'enhanced') {
    // Per-channel backgrounds also neutralise the paper tint (white balance) along with the lighting.

    const grids = [0, 1, 2].map((channel) => smoothGrid(blockBackground(image, channel, blockSize)))

    forEachWithBackground(image, grids, (i, backgrounds) => {
      data[i] = levels((data[i]! * 255) / backgrounds[0]!)

      data[i + 1] = levels((data[i + 1]! * 255) / backgrounds[1]!)

      data[i + 2] = levels((data[i + 2]! * 255) / backgrounds[2]!)
    })

    return image
  }

  const grid = smoothGrid(blockBackground(image, 3, blockSize))

  forEachWithBackground(image, [grid], (i, backgrounds) => {
    data[i] = data[i + 1] = data[i + 2] = levels((luma(data[i]!, data[i + 1]!, data[i + 2]!) * 255) / backgrounds[0]!)
  })

  if (mode === 'bw')
    binarize(image)

  return image
}
