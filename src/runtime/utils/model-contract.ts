export type ImageFrameLike = {
  data: Uint8ClampedArray | Uint8Array
  width: number
  height: number
}

export type CornerHeatmapPoint = {
  x: number
  y: number
  peak: number
  mean: number
  componentArea: number
  confidence: number
}

export type CornerHeatmapResult = {
  corners?: number[]
  confidence: number
  points: Array<CornerHeatmapPoint | undefined>
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const resolveBilinearAxis = (targetIndex: number, sourceSize: number, targetSize: number) => {
  const source = (targetIndex + 0.5) * (sourceSize / targetSize) - 0.5
  const first = clamp(Math.floor(source), 0, sourceSize - 1)
  const second = Math.min(sourceSize - 1, first + 1)
  const weight = clamp(source - Math.floor(source), 0, 1)
  return { first, second, weight }
}

/**
 * Reproduces the DocAligner heatmap model input contract for browser RGBA data.
 * The reference implementation receives OpenCV BGR pixels, resizes bilinearly,
 * transposes to CHW and normalizes to 0..1.
 */
export const preprocessDocAlignerInput = (
  frame: ImageFrameLike,
  targetWidth = 256,
  targetHeight = targetWidth,
) => {
  const planeSize = targetWidth * targetHeight
  const tensor = new Float32Array(planeSize * 3)
  const inv255 = 1 / 255

  for (let y = 0; y < targetHeight; y++) {
    const vertical = resolveBilinearAxis(y, frame.height, targetHeight)
    for (let x = 0; x < targetWidth; x++) {
      const horizontal = resolveBilinearAxis(x, frame.width, targetWidth)
      const targetIndex = y * targetWidth + x
      const sourceIndex00 = (vertical.first * frame.width + horizontal.first) * 4
      const sourceIndex01 = (vertical.first * frame.width + horizontal.second) * 4
      const sourceIndex10 = (vertical.second * frame.width + horizontal.first) * 4
      const sourceIndex11 = (vertical.second * frame.width + horizontal.second) * 4
      const topWeight = 1 - vertical.weight
      const leftWeight = 1 - horizontal.weight

      const sample = (channel: number) => {
        const top =
          frame.data[sourceIndex00 + channel]! * leftWeight +
          frame.data[sourceIndex01 + channel]! * horizontal.weight
        const bottom =
          frame.data[sourceIndex10 + channel]! * leftWeight +
          frame.data[sourceIndex11 + channel]! * horizontal.weight
        return (top * topWeight + bottom * vertical.weight) * inv255
      }

      // OpenCV reference input is BGR, while browser ImageData is RGBA.
      tensor[targetIndex] = sample(2)
      tensor[targetIndex + planeSize] = sample(1)
      tensor[targetIndex + planeSize * 2] = sample(0)
    }
  }

  return {
    data: tensor,
    dims: [1, 3, targetHeight, targetWidth] as [number, number, number, number],
  }
}

const sampleHeatmap = (
  source: Float32Array,
  offset: number,
  sourceWidth: number,
  sourceHeight: number,
  targetX: number,
  targetY: number,
  targetWidth: number,
  targetHeight: number,
) => {
  const horizontal = resolveBilinearAxis(targetX, sourceWidth, targetWidth)
  const vertical = resolveBilinearAxis(targetY, sourceHeight, targetHeight)
  const topWeight = 1 - vertical.weight
  const leftWeight = 1 - horizontal.weight
  const top =
    source[offset + vertical.first * sourceWidth + horizontal.first]! * leftWeight +
    source[offset + vertical.first * sourceWidth + horizontal.second]! * horizontal.weight
  const bottom =
    source[offset + vertical.second * sourceWidth + horizontal.first]! * leftWeight +
    source[offset + vertical.second * sourceWidth + horizontal.second]! * horizontal.weight
  return top * topWeight + bottom * vertical.weight
}

const largestHeatmapComponent = (
  source: Float32Array,
  offset: number,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  threshold: number,
): CornerHeatmapPoint | undefined => {
  const pixelCount = targetWidth * targetHeight
  const mask = new Uint8Array(pixelCount)
  const values = new Float32Array(pixelCount)

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const index = y * targetWidth + x
      const value = sampleHeatmap(
        source,
        offset,
        sourceWidth,
        sourceHeight,
        x,
        y,
        targetWidth,
        targetHeight,
      )
      values[index] = value
      if (value >= threshold) mask[index] = 1
    }
  }

  const queue = new Int32Array(pixelCount)
  let largest:
    | { count: number; sumX: number; sumY: number; sumValue: number; peak: number }
    | undefined

  for (let start = 0; start < pixelCount; start++) {
    if (mask[start] !== 1) continue
    let head = 0
    let tail = 0
    queue[tail++] = start
    mask[start] = 2
    let count = 0
    let sumX = 0
    let sumY = 0
    let sumValue = 0
    let peak = 0

    while (head < tail) {
      const index = queue[head++]!
      const x = index % targetWidth
      const y = Math.floor(index / targetWidth)
      const value = values[index]!
      count++
      sumX += x
      sumY += y
      sumValue += value
      peak = Math.max(peak, value)

      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          if (!offsetX && !offsetY) continue
          const nextX = x + offsetX
          const nextY = y + offsetY
          if (
            nextX < 0 ||
            nextY < 0 ||
            nextX >= targetWidth ||
            nextY >= targetHeight
          ) {
            continue
          }
          const next = nextY * targetWidth + nextX
          if (mask[next] !== 1) continue
          mask[next] = 2
          queue[tail++] = next
        }
      }
    }

    if (!largest || count > largest.count) {
      largest = { count, sumX, sumY, sumValue, peak }
    }
  }

  if (!largest?.count) return
  const mean = largest.sumValue / largest.count
  return {
    x: largest.sumX / largest.count,
    y: largest.sumY / largest.count,
    peak: largest.peak,
    mean,
    componentArea: largest.count,
    confidence: clamp((largest.peak + mean) / 2, 0, 1),
  }
}

/** Decodes DocAligner's four NCHW heatmaps in TL, TR, BR, BL order. */
export const decodeCornerHeatmaps = (input: {
  outputData: Float32Array
  outputShape: readonly number[]
  imageWidth: number
  imageHeight: number
  threshold?: number
}): CornerHeatmapResult => {
  const { outputData, outputShape, imageWidth, imageHeight } = input
  const threshold = clamp(input.threshold ?? 0.3, 0, 1)
  if (
    outputShape.length !== 4 ||
    outputShape[0] !== 1 ||
    outputShape[1] !== 4 ||
    !outputShape[2] ||
    !outputShape[3]
  ) {
    return { confidence: 0, points: [] }
  }

  const sourceHeight = outputShape[2]!
  const sourceWidth = outputShape[3]!
  const heatmapSize = sourceWidth * sourceHeight
  const points = Array.from({ length: 4 }, (_, corner) =>
    largestHeatmapComponent(
      outputData,
      corner * heatmapSize,
      sourceWidth,
      sourceHeight,
      imageWidth,
      imageHeight,
      threshold,
    ),
  )
  const complete = points.every((point) => Boolean(point))
  const confidence = complete
    ? Math.min(...points.map((point) => point!.confidence))
    : 0

  return {
    corners: complete
      ? points.flatMap((point) => [point!.x, point!.y])
      : undefined,
    confidence,
    points,
  }
}
