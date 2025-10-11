import type { DocumentPage } from '../types'

declare const cv: any

export const getThumbnail = (
  imageData: ImageData,
  format: 'image/png' | 'image/jpeg' = 'image/jpeg',
  quality = 0.8,
) => {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
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

export const postprocessImage = (imageData: ImageData, corners: number[]) => {
  // Crop image by corners
  const cropped = cropByCorners(imageData, corners)
  // Warp image by corners
  const warped = warpByCorners(imageData, corners)
  // Convert to grayscale
  const grayscale = toGrayscale(warped!)
  // Create thumbnail
  const thumbnail = getThumbnail(grayscale!)
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
