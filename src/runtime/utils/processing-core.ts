import type {
  DocumentProcessingProfile,
  ProcessingRecipe,
  QualityAssessment,
} from '../types'

export type ProcessingOptions = {
  profile: DocumentProcessingProfile
  rotation?: 0 | 90 | 180 | 270
  maxPixels?: number
  maxLongEdge?: number
  quadConfidence?: number
  motion?: number
}

export type ProcessedPixels = {
  imageData: ImageData
  quality: QualityAssessment
  recipe: ProcessingRecipe
}

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

const createPixels = (data: Uint8ClampedArray, width: number, height: number) => {
  if (typeof ImageData !== 'undefined') {
    return new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height)
  }
  return { data, width, height, colorSpace: 'srgb' } as ImageData
}

const luminance = (data: Uint8ClampedArray, index: number) =>
  data[index]! * 0.299 + data[index + 1]! * 0.587 + data[index + 2]! * 0.114

export const normalizeQuad = (
  corners: number[],
  width: number,
  height: number,
) => corners.map((value, index) => value / (index % 2 === 0 ? width : height))

export const denormalizeQuad = (
  corners: number[],
  width: number,
  height: number,
) => corners.map((value, index) => value * (index % 2 === 0 ? width : height))

export const resolveWarpSize = (
  corners: number[],
  maxPixels = 8_000_000,
  maxLongEdge = 3200,
) => {
  if (corners.length !== 8) return undefined
  const distance = (a: number, b: number) =>
    Math.hypot(corners[b]! - corners[a]!, corners[b + 1]! - corners[a + 1]!)
  let width = Math.max(distance(0, 2), distance(6, 4))
  let height = Math.max(distance(0, 6), distance(2, 4))
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) {
    return undefined
  }
  const scale = Math.min(
    1,
    maxLongEdge / Math.max(width, height),
    Math.sqrt(maxPixels / (width * height)),
  )
  width = Math.max(2, Math.round(width * scale))
  height = Math.max(2, Math.round(height * scale))
  return { width, height }
}

const squareToQuadTransform = (corners: number[]) => {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = corners as [
    number, number, number, number, number, number, number, number,
  ]
  const dx1 = x1 - x2
  const dx2 = x3 - x2
  const dx3 = x0 - x1 + x2 - x3
  const dy1 = y1 - y2
  const dy2 = y3 - y2
  const dy3 = y0 - y1 + y2 - y3
  const denominator = dx1 * dy2 - dx2 * dy1
  const g = Math.abs(denominator) < 1e-8
    ? 0
    : (dx3 * dy2 - dx2 * dy3) / denominator
  const h = Math.abs(denominator) < 1e-8
    ? 0
    : (dx1 * dy3 - dx3 * dy1) / denominator
  return {
    a: x1 - x0 + g * x1,
    b: x3 - x0 + h * x3,
    c: x0,
    d: y1 - y0 + g * y1,
    e: y3 - y0 + h * y3,
    f: y0,
    g,
    h,
  }
}

export const warpPerspective = (
  source: ImageData,
  corners: number[],
  maxPixels?: number,
  maxLongEdge?: number,
) => {
  const size = resolveWarpSize(corners, maxPixels, maxLongEdge)
  if (!size) return undefined
  const transform = squareToQuadTransform(corners)
  const output = new Uint8ClampedArray(size.width * size.height * 4)
  const src = source.data
  const sourceMaxX = source.width - 1
  const sourceMaxY = source.height - 1

  for (let y = 0; y < size.height; y++) {
    const v = size.height === 1 ? 0 : y / (size.height - 1)
    for (let x = 0; x < size.width; x++) {
      const u = size.width === 1 ? 0 : x / (size.width - 1)
      const denominator = transform.g * u + transform.h * v + 1
      const sourceX = Math.max(
        0,
        Math.min(sourceMaxX, (transform.a * u + transform.b * v + transform.c) / denominator),
      )
      const sourceY = Math.max(
        0,
        Math.min(sourceMaxY, (transform.d * u + transform.e * v + transform.f) / denominator),
      )
      const x0 = Math.floor(sourceX)
      const y0 = Math.floor(sourceY)
      const x1 = Math.min(sourceMaxX, x0 + 1)
      const y1 = Math.min(sourceMaxY, y0 + 1)
      const wx = sourceX - x0
      const wy = sourceY - y0
      const targetIndex = (y * size.width + x) * 4
      const indices = [
        (y0 * source.width + x0) * 4,
        (y0 * source.width + x1) * 4,
        (y1 * source.width + x0) * 4,
        (y1 * source.width + x1) * 4,
      ]
      for (let channel = 0; channel < 4; channel++) {
        const top = src[indices[0]! + channel]! * (1 - wx) + src[indices[1]! + channel]! * wx
        const bottom = src[indices[2]! + channel]! * (1 - wx) + src[indices[3]! + channel]! * wx
        output[targetIndex + channel] = top * (1 - wy) + bottom * wy
      }
    }
  }
  return createPixels(output, size.width, size.height)
}

export const rotateImageData = (
  source: ImageData,
  rotation: 0 | 90 | 180 | 270,
) => {
  if (!rotation) return source
  const outputWidth = rotation === 90 || rotation === 270 ? source.height : source.width
  const outputHeight = rotation === 90 || rotation === 270 ? source.width : source.height
  const output = new Uint8ClampedArray(outputWidth * outputHeight * 4)
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      let targetX = x
      let targetY = y
      if (rotation === 90) {
        targetX = source.height - 1 - y
        targetY = x
      } else if (rotation === 180) {
        targetX = source.width - 1 - x
        targetY = source.height - 1 - y
      } else if (rotation === 270) {
        targetX = y
        targetY = source.width - 1 - x
      }
      const sourceIndex = (y * source.width + x) * 4
      const targetIndex = (targetY * outputWidth + targetX) * 4
      output.set(source.data.subarray(sourceIndex, sourceIndex + 4), targetIndex)
    }
  }
  return createPixels(output, outputWidth, outputHeight)
}

const percentileBounds = (source: ImageData, low = 0.02, high = 0.98) => {
  const histogram = new Uint32Array(256)
  for (let index = 0; index < source.data.length; index += 4) {
    const value = Math.round(luminance(source.data, index))
    histogram[value] = histogram[value]! + 1
  }
  const pixels = source.width * source.height
  const find = (fraction: number) => {
    const target = pixels * fraction
    let cumulative = 0
    for (let value = 0; value < histogram.length; value++) {
      cumulative += histogram[value]!
      if (cumulative >= target) return value
    }
    return 255
  }
  return { low: find(low), high: find(high) }
}

export const stretchLuminance = (
  source: ImageData,
  lowPercentile = 0.02,
  highPercentile = 0.98,
  strength = 0.82,
) => {
  const bounds = percentileBounds(source, lowPercentile, highPercentile)
  if (bounds.high <= bounds.low + 4) return source
  const output = new Uint8ClampedArray(source.data.length)
  const scale = 255 / (bounds.high - bounds.low)
  for (let index = 0; index < source.data.length; index += 4) {
    const originalLuminance = luminance(source.data, index)
    const stretched = clampByte((originalLuminance - bounds.low) * scale)
    const targetLuminance = originalLuminance * (1 - strength) + stretched * strength
    const ratio = targetLuminance / Math.max(1, originalLuminance)
    output[index] = clampByte(source.data[index]! * ratio)
    output[index + 1] = clampByte(source.data[index + 1]! * ratio)
    output[index + 2] = clampByte(source.data[index + 2]! * ratio)
    output[index + 3] = source.data[index + 3]!
  }
  return createPixels(output, source.width, source.height)
}

export const grayscaleImage = (source: ImageData) => {
  const output = new Uint8ClampedArray(source.data.length)
  for (let index = 0; index < source.data.length; index += 4) {
    const value = clampByte(luminance(source.data, index))
    output[index] = value
    output[index + 1] = value
    output[index + 2] = value
    output[index + 3] = source.data[index + 3]!
  }
  return createPixels(output, source.width, source.height)
}

const otsuThreshold = (source: ImageData) => {
  const histogram = new Uint32Array(256)
  for (let index = 0; index < source.data.length; index += 4) {
    const value = Math.round(luminance(source.data, index))
    histogram[value] = histogram[value]! + 1
  }
  const pixels = source.width * source.height
  let total = 0
  for (let value = 0; value < 256; value++) total += value * histogram[value]!
  let backgroundWeight = 0
  let backgroundSum = 0
  let maximumVariance = 0
  let threshold = 127
  for (let value = 0; value < 256; value++) {
    backgroundWeight += histogram[value]!
    if (!backgroundWeight) continue
    const foregroundWeight = pixels - backgroundWeight
    if (!foregroundWeight) break
    backgroundSum += value * histogram[value]!
    const backgroundMean = backgroundSum / backgroundWeight
    const foregroundMean = (total - backgroundSum) / foregroundWeight
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2
    if (variance > maximumVariance) {
      maximumVariance = variance
      threshold = value
    }
  }
  return threshold
}

export const blackAndWhiteImage = (source: ImageData) => {
  const threshold = otsuThreshold(source)
  const output = new Uint8ClampedArray(source.data.length)
  for (let index = 0; index < source.data.length; index += 4) {
    const value = luminance(source.data, index) < threshold ? 0 : 255
    output[index] = value
    output[index + 1] = value
    output[index + 2] = value
    output[index + 3] = 255
  }
  return createPixels(output, source.width, source.height)
}

export const reduceNoise = (source: ImageData) => {
  const output = new Uint8ClampedArray(source.data.length)
  const weights = [1, 2, 1, 2, 4, 2, 1, 2, 1]
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const targetIndex = (y * source.width + x) * 4
      for (let channel = 0; channel < 3; channel++) {
        let sum = 0
        let weightIndex = 0
        for (let offsetY = -1; offsetY <= 1; offsetY++) {
          const sourceY = Math.max(0, Math.min(source.height - 1, y + offsetY))
          for (let offsetX = -1; offsetX <= 1; offsetX++) {
            const sourceX = Math.max(0, Math.min(source.width - 1, x + offsetX))
            const sourceIndex = (sourceY * source.width + sourceX) * 4
            sum += source.data[sourceIndex + channel]! * weights[weightIndex++]!
          }
        }
        output[targetIndex + channel] = sum / 16
      }
      output[targetIndex + 3] = source.data[targetIndex + 3]!
    }
  }
  return createPixels(output, source.width, source.height)
}

export const sharpenImage = (source: ImageData, strength = 0.45, threshold = 7) => {
  const output = new Uint8ClampedArray(source.data)
  for (let y = 1; y < source.height - 1; y++) {
    for (let x = 1; x < source.width - 1; x++) {
      const index = (y * source.width + x) * 4
      for (let channel = 0; channel < 3; channel++) {
        const center = source.data[index + channel]!
        const average = (
          source.data[index - 4 + channel]! +
          source.data[index + 4 + channel]! +
          source.data[index - source.width * 4 + channel]! +
          source.data[index + source.width * 4 + channel]!
        ) / 4
        const detail = center - average
        output[index + channel] = Math.abs(detail) < threshold
          ? center
          : clampByte(center + detail * strength)
      }
    }
  }
  return createPixels(output, source.width, source.height)
}

export const assessImageQuality = (
  source: ImageData,
  options: { coverage?: number; quadConfidence?: number; motion?: number } = {},
): QualityAssessment => {
  const step = Math.max(1, Math.floor(Math.sqrt((source.width * source.height) / 120_000)))
  let samples = 0
  let dark = 0
  let bright = 0
  let glare = 0
  let gradient = 0
  for (let y = 0; y < source.height - step; y += step) {
    for (let x = 0; x < source.width - step; x += step) {
      const index = (y * source.width + x) * 4
      const value = luminance(source.data, index)
      const right = luminance(source.data, index + step * 4)
      const down = luminance(source.data, index + step * source.width * 4)
      const localGradient = (Math.abs(value - right) + Math.abs(value - down)) / 2
      if (value < 28) dark++
      if (value > 245) bright++
      if (value > 248 && localGradient < 4) glare++
      gradient += localGradient
      samples++
    }
  }
  const darkRatio = dark / Math.max(1, samples)
  const brightRatio = bright / Math.max(1, samples)
  const glareRatio = glare / Math.max(1, samples)
  const sharpness = clamp01((gradient / Math.max(1, samples) - 2.5) / 20)
  const exposure = clamp01(1 - Math.max(0, darkRatio - 0.04) * 3 - Math.max(0, brightRatio - 0.08) * 2.5)
  const coverage = clamp01(options.coverage ?? 1)
  const quadConfidence = clamp01(options.quadConfidence ?? 1)
  const motion = clamp01(options.motion ?? 0)
  const warnings: QualityAssessment['warnings'] = []
  if (coverage < 0.18) warnings.push('move-closer')
  if (motion > 0.03 || sharpness < 0.2) warnings.push('hold-still')
  if (darkRatio > 0.22 || exposure < 0.48) warnings.push('too-dark')
  if (glareRatio > 0.08 || brightRatio > 0.3) warnings.push('glare')
  if (quadConfidence < 0.45) warnings.push('corners-missing')
  return {
    quadConfidence,
    coverage,
    sharpness,
    exposure,
    glare: glareRatio,
    motion,
    acceptableForAutoCapture: warnings.length === 0,
    warnings,
  }
}

export const applyProcessingProfile = (
  source: ImageData,
  profile: DocumentProcessingProfile,
) => {
  if (profile === 'original') return source
  if (profile === 'color') return sharpenImage(stretchLuminance(source, 0.01, 0.99, 0.45), 0.25, 10)
  if (profile === 'document') {
    return sharpenImage(reduceNoise(stretchLuminance(source, 0.02, 0.98, 0.72)), 0.42, 8)
  }
  const grayscale = grayscaleImage(stretchLuminance(source, 0.02, 0.98, 0.86))
  if (profile === 'black-and-white') return blackAndWhiteImage(grayscale)
  return sharpenImage(grayscale, 0.35, 8)
}

export const processDocumentPixels = (
  source: ImageData,
  corners: number[],
  options: ProcessingOptions,
): ProcessedPixels | undefined => {
  const warped = warpPerspective(
    source,
    corners,
    options.maxPixels,
    options.maxLongEdge,
  )
  if (!warped) return undefined
  const coverageSize = resolveWarpSize(corners, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
  const coverage = coverageSize
    ? (coverageSize.width * coverageSize.height) / (source.width * source.height)
    : 0
  const quality = assessImageQuality(warped, {
    coverage,
    quadConfidence: options.quadConfidence,
    motion: options.motion,
  })
  const profiled = applyProcessingProfile(warped, options.profile)
  const rotated = rotateImageData(profiled, options.rotation || 0)
  return {
    imageData: rotated,
    quality,
    recipe: {
      version: 1,
      parameters: {
        profile: options.profile,
        maxPixels: options.maxPixels || 8_000_000,
        maxLongEdge: options.maxLongEdge || 3200,
        resampling: 'bilinear',
        contrast: 'luminance-percentile',
      },
    },
  }
}
