import type { Point } from './geometry'

export type HeatmapDetection = {
  /** Corner positions normalised to [0, 1] of the model input, in the model's channel order. */
  points: Point[];
  /** Peak value (sigmoid) of each corner's heatmap. */
  confidences: number[];
}
/**
 * Decodes corner heatmaps (NCHW, one channel per corner) to sub-cell positions.
 *
 * A plain argmax snaps every corner to the heatmap grid (128 cells for a 256 input, i.e. ~15px on a 1920px
 * frame) and, without the half-cell offset, biases all corners towards the top-left. Taking the
 * floor-subtracted centroid of the window around the peak recovers the sub-cell position.
 */
export const decodeHeatmaps = (data: Float32Array, channels: number, height: number, width: number, radius = 2): HeatmapDetection => {
  const size = width * height

  const points: Point[] = []

  const confidences: number[] = []

  for (let c = 0; c < channels; c++) {
    const offset = c * size

    let peak = -Infinity

    let peakIndex = 0

    for (let i = 0; i < size; i++) {
      const value = data[offset + i]!

      if (value > peak) {
        peak = value

        peakIndex = i
      }
    }

    const px = peakIndex % width

    const py = (peakIndex - px) / width

    const x0 = Math.max(0, px - radius)

    const x1 = Math.min(width - 1, px + radius)

    const y0 = Math.max(0, py - radius)

    const y1 = Math.min(height - 1, py + radius)

    let floor = Infinity

    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        floor = Math.min(floor, data[offset + y * width + x]!)

    let sum = 0

    let sx = 0

    let sy = 0

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const weight = data[offset + y * width + x]! - floor

        sum += weight

        sx += weight * x

        sy += weight * y
      }
    }

    const cx = sum > 0 ? sx / sum : px

    const cy = sum > 0 ? sy / sum : py

    points.push({ x: (cx + 0.5) / width, y: (cy + 0.5) / height })

    confidences.push(peak)
  }

  return { points, confidences }
}
