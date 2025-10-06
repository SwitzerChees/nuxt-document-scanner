/**
 * Image Processing Utilities
 * Handles perspective transformation, frame capture, and format conversion
 */

import { getCV, isOpenCVReady } from './opencv-loader'
import { orderQuad } from './edge-detection'
import { logWarn } from './logging'

// Extend Window interface for warning flags
declare global {
  interface Window {
    _documentScannerCorsWarning?: boolean
    _documentScannerDomWarning?: boolean
  }
}

/**
 * Capture RGBA ImageData from video element
 */
export function grabRGBA(video: HTMLVideoElement): ImageData | undefined {
  if (!video.videoWidth || !video.videoHeight) return undefined

  // Check if video is ready and not tainted
  if (video.readyState < 2) return undefined

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return undefined

  try {
    // Check for cross-origin issues
    if (video.crossOrigin && video.crossOrigin !== 'anonymous') {
      // Try to handle CORS issues more gracefully
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      } catch {
        // Log CORS issues only if logging is enabled, and only once per session
        if (!window.hasOwnProperty('_documentScannerCorsWarning')) {
          window._documentScannerCorsWarning = true
          logWarn(
            'Video CORS issue - consider setting crossOrigin="anonymous" on video element',
          )
        }
        return undefined
      }
    } else {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    }

    // Check if canvas is tainted (cross-origin data)
    const testPixel = ctx.getImageData(0, 0, 1, 1)
    if (testPixel.data[3] === 0) {
      // Canvas is tainted, can't read pixel data
      return undefined
    }

    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  } catch (error) {
    // Only log error if it's not a common mobile Safari issue
    const errorString = String(error)
    if (
      errorString.includes('DOMException') &&
      !window.hasOwnProperty('_documentScannerDomWarning')
    ) {
      window._documentScannerDomWarning = true
      logWarn('Canvas access issue - this is common on mobile browsers')
    }
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
      { x: ordered[0]!, y: ordered[1]! },
      { x: ordered[2]!, y: ordered[3]! },
      { x: ordered[4]!, y: ordered[5]! },
      { x: ordered[6]!, y: ordered[7]! },
    ]

    // Calculate output dimensions based on quad shape
    const widthTop = distance(points[0]!, points[1]!)
    const widthBottom = distance(points[3]!, points[2]!)
    const heightLeft = distance(points[0]!, points[3]!)
    const heightRight = distance(points[1]!, points[2]!)

    const maxWidth = Math.max(widthTop, widthBottom)
    const maxHeight = Math.max(heightLeft, heightRight)

    // Calculate output height maintaining aspect ratio
    const outputHeight = Math.round(maxHeight * (outputWidth / maxWidth))

    // Source points (quad corners)
    const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      points[0]!.x,
      points[0]!.y, // top-left
      points[1]!.x,
      points[1]!.y, // top-right
      points[2]!.x,
      points[2]!.y, // bottom-right
      points[3]!.x,
      points[3]!.y, // bottom-left
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

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return ''

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL(format, quality)
}

/**
 * Enhance document image for better readability
 * Applies color enhancement for better machine readability (keeps color)
 */
export function enhanceDocument(imageData: ImageData): ImageData {
  if (!isOpenCVReady()) {
    console.warn('Cannot enhance: OpenCV not ready')
    return imageData
  }

  const cv = getCV()

  try {
    const src = cv.matFromImageData(imageData)

    // Convert to LAB color space for better color manipulation
    const lab = new cv.Mat()
    cv.cvtColor(src, lab, cv.COLOR_RGBA2RGB)
    cv.cvtColor(lab, lab, cv.COLOR_RGB2Lab)

    // Split LAB channels
    const channels = new cv.MatVector()
    cv.split(lab, channels)

    // Apply CLAHE (Contrast Limited Adaptive Histogram Equalization) to L channel
    const clahe = new cv.CLAHE(2.5, new cv.Size(8, 8))
    const lChannel = channels.get(0)
    clahe.apply(lChannel, lChannel)

    // Cleanup CLAHE immediately after use
    clahe.delete()

    // Merge channels back
    cv.merge(channels, lab)

    // Convert back to RGB
    const enhanced = new cv.Mat()
    cv.cvtColor(lab, enhanced, cv.COLOR_Lab2RGB)
    cv.cvtColor(enhanced, enhanced, cv.COLOR_RGB2RGBA)

    // Apply unsharp mask for sharpness
    const blurred = new cv.Mat()
    cv.GaussianBlur(enhanced, blurred, new cv.Size(0, 0), 3)

    const sharpened = new cv.Mat()
    cv.addWeighted(enhanced, 1.5, blurred, -0.5, 0, sharpened)

    // Convert to ImageData
    const outputData = new Uint8ClampedArray(sharpened.data)
    const result = new ImageData(outputData, sharpened.cols, sharpened.rows)

    // Cleanup
    src.delete()
    lab.delete()
    channels.delete()
    enhanced.delete()
    blurred.delete()
    sharpened.delete()

    return result
  } catch (error) {
    console.error('Error enhancing document:', error)
    return imageData
  }
}
