/**
 * Image Processing Utilities
 * Handles perspective transformation, frame capture, and format conversion
 */

import { getCV, isOpenCVReady } from './opencv-loader'
import { orderQuad } from './edge-detection'

/**
 * Capture RGBA ImageData from video element
 */
export function grabRGBA(video: HTMLVideoElement): ImageData | undefined {
  if (!video.videoWidth || !video.videoHeight) return undefined

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined

  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  } catch (error) {
    console.error('Error capturing video frame:', error)
    return undefined
  }
}

/**
 * Calculate distance between two points
 */
function distance(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
): number {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)
}

/**
 * Warp perspective to flatten document
 * Takes a quadrilateral from the source image and transforms it to a rectangle
 */
export function warpPerspective(
  sourceImage: ImageData,
  quad: number[],
  outputWidth = 1000,
): ImageData | undefined {
  if (!isOpenCVReady() || !quad || quad.length !== 8) {
    console.warn('Cannot warp: OpenCV not ready or invalid quad')
    return undefined
  }

  const cv = getCV()

  try {
    const src = cv.matFromImageData(sourceImage)

    // Order quad points consistently
    const ordered = orderQuad(quad)
    if (!ordered) {
      src.delete()
      return undefined
    }

    // Convert flat array to point objects
    const points = [
      { x: ordered[0], y: ordered[1] },
      { x: ordered[2], y: ordered[3] },
      { x: ordered[4], y: ordered[5] },
      { x: ordered[6], y: ordered[7] },
    ]

    // Calculate output dimensions based on quad shape
    const widthTop = distance(points[0], points[1])
    const widthBottom = distance(points[3], points[2])
    const heightLeft = distance(points[0], points[3])
    const heightRight = distance(points[1], points[2])

    const maxWidth = Math.max(widthTop, widthBottom)
    const maxHeight = Math.max(heightLeft, heightRight)

    // Calculate output height maintaining aspect ratio
    const outputHeight = Math.round(maxHeight * (outputWidth / maxWidth))

    // Source points (quad corners)
    const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      points[0].x,
      points[0].y, // top-left
      points[1].x,
      points[1].y, // top-right
      points[2].x,
      points[2].y, // bottom-right
      points[3].x,
      points[3].y, // bottom-left
    ])

    // Destination points (rectangle)
    const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0,
      0, // top-left
      outputWidth,
      0, // top-right
      outputWidth,
      outputHeight, // bottom-right
      0,
      outputHeight, // bottom-left
    ])

    // Calculate perspective transform matrix
    const M = cv.getPerspectiveTransform(srcPoints, dstPoints)

    // Apply transformation
    const dst = new cv.Mat()
    const dsize = new cv.Size(outputWidth, outputHeight)
    cv.warpPerspective(src, dst, M, dsize)

    // Convert back to ImageData
    const outputData = new Uint8ClampedArray(dst.data)
    const result = new ImageData(outputData, outputWidth, outputHeight)

    // Cleanup
    src.delete()
    srcPoints.delete()
    dstPoints.delete()
    M.delete()
    dst.delete()

    return result
  } catch (error) {
    console.error('Error in warpPerspective:', error)
    return undefined
  }
}

/**
 * Convert ImageData to base64 data URL
 * Useful for previews and storage
 */
export function imageDataToBase64(
  imageData: ImageData,
  format: 'image/png' | 'image/jpeg' = 'image/jpeg',
  quality = 0.92,
): string {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height

  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL(format, quality)
}

/**
 * Create thumbnail from ImageData
 */
export function createThumbnail(
  imageData: ImageData,
  maxSize = 200,
): ImageData {
  const scale = Math.min(maxSize / imageData.width, maxSize / imageData.height)
  const thumbWidth = Math.round(imageData.width * scale)
  const thumbHeight = Math.round(imageData.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = thumbWidth
  canvas.height = thumbHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) return imageData

  // Create temporary canvas with source image
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = imageData.width
  tempCanvas.height = imageData.height
  const tempCtx = tempCanvas.getContext('2d')
  if (!tempCtx) return imageData

  tempCtx.putImageData(imageData, 0, 0)

  // Draw scaled
  ctx.drawImage(tempCanvas, 0, 0, thumbWidth, thumbHeight)

  return ctx.getImageData(0, 0, thumbWidth, thumbHeight)
}

/**
 * Scale quad coordinates
 * Useful when scaling between different resolution frames
 */
export function scaleQuad(
  quad: number[],
  scaleX: number,
  scaleY: number,
): number[] {
  return quad.map((coord, idx) =>
    idx % 2 === 0 ? coord * scaleX : coord * scaleY,
  )
}
