import type { DocumentPage } from '../types'

declare const cv: any

export const postprocessImage = (imageData: ImageData, corners: number[]) => {
  // Crop image by corners
  const cropped = cropByCorners(imageData, corners)
  // Warp image by corners
  const warped = warpByCorners(imageData, corners)
  // Convert to grayscale
  const grayscale = toGrayscale(warped!)
  // Normalize contrast
  const normalized = normalizeContrast(grayscale!)
  // Reduce noise
  const reduced = reduceNoise(normalized!)
  // Deskew image
  const deskewed = deskew(reduced!)
  // Sharpen image
  const sharpened = sharpen(deskewed!)
  // Create thumbnail
  const thumbnail = getThumbnail(sharpened!)
  return {
    id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'image',
    format: 'jpg',
    original: imageData,
    processed: cropped,
    quad: corners,
    timestamp: Date.now(),
    thumbnail,
  } satisfies DocumentPage
}

export const getThumbnail = (
  imageData: ImageData,
  format: 'image/png' | 'image/jpeg' = 'image/jpeg',
  quality = 0.8,
) => {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height

  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL(format, quality)
}

export const cropByCorners = (imageData: ImageData, corners: number[]) => {
  if (!imageData || corners.length !== 8) return undefined

  const xs = [corners[0], corners[2], corners[4], corners[6]] as number[]
  const ys = [corners[1], corners[3], corners[5], corners[7]] as number[]

  const minX = Math.max(Math.min(...xs), 0)
  const minY = Math.max(Math.min(...ys), 0)
  const maxX = Math.min(Math.max(...xs), imageData.width)
  const maxY = Math.min(Math.max(...ys), imageData.height)

  const width = maxX - minX
  const height = maxY - minY
  if (width <= 0 || height <= 0) return undefined

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  // draw original imageData into context
  ctx!.putImageData(imageData, -minX, -minY)

  // extract cropped region as new ImageData
  return ctx!.getImageData(0, 0, width, height)
}

export const warpByCorners = (imageData: ImageData, corners: number[]) => {
  if (!imageData || corners.length !== 8) return undefined
  if (typeof cv === 'undefined') {
    console.error('OpenCV.js not loaded')
    return undefined
  }

  const src = cv.matFromImageData(imageData)
  const dst = new cv.Mat()

  // input corners (order: top-left, top-right, bottom-right, bottom-left)
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, corners)

  // compute target rect dimensions
  const wTop = Math.hypot(corners[2]! - corners[0]!, corners[3]! - corners[1]!)
  const wBottom = Math.hypot(
    corners[4]! - corners[6]!,
    corners[5]! - corners[7]!,
  )
  const width = Math.max(wTop, wBottom)

  const hLeft = Math.hypot(corners[6]! - corners[0]!, corners[7]! - corners[1]!)
  const hRight = Math.hypot(
    corners[4]! - corners[2]!,
    corners[5]! - corners[3]!,
  )
  const height = Math.max(hLeft, hRight)

  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    width,
    0,
    width,
    height,
    0,
    height,
  ])

  const M = cv.getPerspectiveTransform(srcTri, dstTri)
  cv.warpPerspective(
    src,
    dst,
    M,
    new cv.Size(width, height),
    cv.INTER_LINEAR,
    cv.BORDER_REPLICATE,
    new cv.Scalar(),
  )

  const warped = new ImageData(
    new Uint8ClampedArray(dst.data),
    dst.cols,
    dst.rows,
  )

  src.delete()
  dst.delete()
  srcTri.delete()
  dstTri.delete()
  M.delete()

  return warped
}

export const copyImageData = (imageData: ImageData) => {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  const ctx = canvas.getContext('2d')
  ctx!.putImageData(imageData, 0, 0)
  return ctx!.getImageData(0, 0, imageData.width, imageData.height) as ImageData
}

export const toGrayscale = (imageData: ImageData) => {
  if (!imageData) return undefined

  const { width, height, data } = imageData
  const out = new Uint8ClampedArray(data.length)

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    // Standard luminance formula (sRGB)
    const gray = 0.299 * r! + 0.587 * g! + 0.114 * b!

    out[i] = out[i + 1] = out[i + 2] = gray
    out[i + 3] = data[i + 3]!
  }

  return new ImageData(out, width, height)
}

export const normalizeContrast = (imageData: ImageData) => {
  if (!imageData) return undefined

  const { width, height, data } = imageData
  let min = 255,
    max = 0

  // find intensity range
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i]
    if (v! < min) min = v!
    if (v! > max) max = v!
  }

  if (max <= min) return imageData // uniform brightness

  const scale = 255 / (max - min)
  const out = new Uint8ClampedArray(data.length)

  for (let i = 0; i < data.length; i += 4) {
    const v = (data[i]! - min) * scale
    const c = v < 0 ? 0 : v > 255 ? 255 : v
    out[i] = out[i + 1] = out[i + 2] = c
    out[i + 3] = data[i + 3]!
  }

  return new ImageData(out, width, height)
}

export const reduceNoise = (imageData: ImageData) => {
  if (!imageData) return undefined

  const { width, height, data } = imageData
  const out = new Uint8ClampedArray(data.length)
  const weights = [1, 2, 1, 2, 4, 2, 1, 2, 1]
  const wSum = 16

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let acc = 0
      let k = 0
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const i = ((y + ky) * width + (x + kx)) * 4
          acc += data[i]! * weights[k++]!
        }
      }
      const v = acc / wSum
      const idx = (y * width + x) * 4
      out[idx]! = out[idx + 1]! = out[idx + 2]! = v
      out[idx + 3]! = data[idx + 3]!
    }
  }

  return new ImageData(out, width, height)
}

export const deskew = (imageData: ImageData) => {
  if (!imageData) return undefined
  if (typeof cv === 'undefined') return imageData

  const src = cv.matFromImageData(imageData)
  const gray = new cv.Mat()
  const bin = new cv.Mat()
  const lines = new cv.Mat()

  // 1) Grayscale
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

  // 2) Light blur → reduce noise
  cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0)

  // 3) Adaptive threshold → emphasize text/edges
  cv.adaptiveThreshold(
    gray,
    bin,
    255,
    cv.ADAPTIVE_THRESH_MEAN_C,
    cv.THRESH_BINARY_INV,
    15,
    10,
  )

  // 4) Slight morphology to connect text
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 1))
  cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, kernel)

  // 5) HoughLinesP to get short line segments
  cv.HoughLinesP(bin, lines, 1, Math.PI / 180, 80, 30, 10)

  // Collect near-horizontal angles (in degrees)
  const angles: number[] = []
  for (let i = 0; i < lines.rows; i++) {
    const x1 = lines.data32S[i * 4]!
    const y1 = lines.data32S[i * 4 + 1]!
    const x2 = lines.data32S[i * 4 + 2]!
    const y2 = lines.data32S[i * 4 + 3]!
    const dx = x2 - x1,
      dy = y2 - y1
    if (dx === 0 && dy === 0) continue
    const rad = Math.atan2(dy, dx)
    const deg = (rad * 180) / Math.PI
    // keep only near-horizontal segments (ignore vertical-ish)
    if (Math.abs(deg) <= 45) angles.push(deg)
  }

  // No reliable lines → return original
  if (!angles.length) {
    src.delete()
    gray.delete()
    bin.delete()
    lines.delete()
    kernel.delete()
    return imageData
  }

  // Median is robust against outliers
  angles.sort((a, b) => a - b)
  const median = angles[Math.floor(angles.length / 2)]!

  // Clamp and threshold tiny corrections
  const clamped = Math.max(-10, Math.min(10, median))
  if (Math.abs(clamped) < 0.2) {
    src.delete()
    gray.delete()
    bin.delete()
    lines.delete()
    kernel.delete()
    return imageData
  }

  // 6) Rotate by -angle (bring lines to 0°)
  const center = new cv.Point(src.cols / 2, src.rows / 2)
  const M = cv.getRotationMatrix2D(center, -clamped, 1)
  const rotated = new cv.Mat()
  cv.warpAffine(
    src,
    rotated,
    M,
    new cv.Size(src.cols, src.rows),
    cv.INTER_LINEAR,
    cv.BORDER_REPLICATE,
    new cv.Scalar(),
  )

  const result = new ImageData(
    new Uint8ClampedArray(rotated.data),
    rotated.cols,
    rotated.rows,
  )

  src.delete()
  gray.delete()
  bin.delete()
  lines.delete()
  kernel.delete()
  M.delete()
  rotated.delete()
  return result
}

export const sharpen = (
  imageData: ImageData,
  strength = 1.2,
  radius = 1, // >=1 → wider blur → smoother unsharp mask
  threshold = 0, // 0–255; skip sharpening for small differences
) => {
  if (!imageData) return undefined
  if (radius < 1) radius = 1

  const { width, height, data } = imageData
  const out = new Uint8ClampedArray(data.length)
  const blurred = gaussianBlurSeparable(data, width, height, radius)

  // Unsharp mask: result = orig + k * (orig - blur)
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const o = data[i + c]!
      const b = blurred[i + c]!
      const diff = o - b
      const val = Math.abs(diff) < threshold ? o : o + strength * diff
      out[i + c]! = val < 0 ? 0 : val > 255 ? 255 : val
    }
    out[i + 3]! = data[i + 3]!
  }

  return new ImageData(out, width, height)
}

const gaussianBlurSeparable = (
  src: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
) => {
  const k = gaussianKernel(radius)
  const kw = k.length
  const tmp = new Float32Array(src.length)
  const dst = new Uint8ClampedArray(src.length)

  // ---- Horizontal
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const base = (y * w + x) * 4
      let r = 0,
        g = 0,
        b = 0,
        a = 0
      for (let i = 0; i < kw; i++) {
        const dx = x + i - radius
        const cx = dx < 0 ? 0 : dx >= w ? w - 1 : dx
        const idx = (y * w + cx) * 4
        const ki = k[i]!
        r += src[idx]! * ki
        g += src[idx + 1]! * ki
        b += src[idx + 2]! * ki
        a += src[idx + 3]! * ki
      }
      tmp[base]! = r
      tmp[base + 1]! = g
      tmp[base + 2]! = b
      tmp[base + 3]! = a
    }
  }

  // ---- Vertical
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const base = (y * w + x) * 4
      let r = 0,
        g = 0,
        b = 0,
        a = 0
      for (let i = 0; i < kw; i++) {
        const dy = y + i - radius
        const cy = dy < 0 ? 0 : dy >= h ? h - 1 : dy
        const idx = (cy * w + x) * 4
        const ki = k[i]!
        r += tmp[idx]! * ki
        g += tmp[idx + 1]! * ki
        b += tmp[idx + 2]! * ki
        a += tmp[idx + 3]! * ki
      }
      dst[base]! = r < 0 ? 0 : r > 255 ? 255 : r
      dst[base + 1]! = g < 0 ? 0 : g > 255 ? 255 : g
      dst[base + 2]! = b < 0 ? 0 : b > 255 ? 255 : b
      dst[base + 3]! = a < 0 ? 0 : a > 255 ? 255 : a
    }
  }

  return dst
}

const gaussianKernel = (radius: number) => {
  const sigma = radius // simple mapping; increase for softer blur
  const len = radius * 2 + 1
  const k = new Float32Array(len)
  const s2 = 2 * sigma * sigma
  let sum = 0
  for (let i = 0; i < len; i++) {
    const x = i - radius
    const v = Math.exp(-(x * x) / s2)
    k[i]! = v
    sum += v
  }
  for (let i = 0; i < len; i++) k[i]! /= sum
  return k
}
