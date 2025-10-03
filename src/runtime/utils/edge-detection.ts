/**
 * Edge Detection Utilities
 * Hough Lines-based document detection
 */

import { getCV, isOpenCVReady } from './opencv-loader'

export interface EdgeDetectionParams {
  houghThreshold?: number
  minLineLength?: number
  maxLineGap?: number
  minAreaPercent?: number
}

export interface DetectionStats {
  horizontalLines: number
  verticalLines: number
  quadDetected: boolean
}

/**
 * Calculate intersection point of two lines
 */
function lineIntersection(
  line1: { x1: number; y1: number; x2: number; y2: number },
  line2: { x1: number; y1: number; x2: number; y2: number },
): { x: number; y: number } | undefined {
  const x1 = line1.x1
  const y1 = line1.y1
  const x2 = line1.x2
  const y2 = line1.y2
  const x3 = line2.x1
  const y3 = line2.y1
  const x4 = line2.x2
  const y4 = line2.y2

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (Math.abs(denom) < 0.01) return undefined

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
  const x = x1 + t * (x2 - x1)
  const y = y1 + t * (y2 - y1)

  return { x, y }
}

/**
 * Detect document quadrilateral using Hough Lines method
 * More precise than contour detection for document edges
 */
export function detectQuadWithHoughLines(
  edgeImage: ImageData,
  params: EdgeDetectionParams = {},
): { quad: number[] | undefined; stats: DetectionStats } {
  const stats: DetectionStats = {
    horizontalLines: 0,
    verticalLines: 0,
    quadDetected: false,
  }

  if (!isOpenCVReady()) {
    console.warn('OpenCV not ready')
    return { quad: undefined, stats }
  }

  const cv = getCV()

  // Default parameters
  const houghThreshold = params.houghThreshold ?? 50
  const minLineLength = params.minLineLength ?? 50
  const maxLineGap = params.maxLineGap ?? 10
  const minAreaPercent = params.minAreaPercent ?? 0.03

  try {
    // Convert ImageData to OpenCV Mat
    const src = cv.matFromImageData(edgeImage)
    const gray = new cv.Mat()
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

    // Apply Hough Line Transform
    const lines = new cv.Mat()
    cv.HoughLinesP(
      gray,
      lines,
      1, // rho: distance resolution in pixels
      Math.PI / 180, // theta: angle resolution in radians
      houghThreshold,
      minLineLength,
      maxLineGap,
    )

    if (lines.rows < 4) {
      // Not enough lines detected
      src.delete()
      gray.delete()
      lines.delete()
      return { quad: undefined, stats }
    }

    // Group lines by orientation
    const horizontalLines: Array<{
      x1: number
      y1: number
      x2: number
      y2: number
      angle: number
    }> = []
    const verticalLines: Array<{
      x1: number
      y1: number
      x2: number
      y2: number
      angle: number
    }> = []

    for (let i = 0; i < lines.rows; i++) {
      const x1 = lines.data32S[i * 4]
      const y1 = lines.data32S[i * 4 + 1]
      const x2 = lines.data32S[i * 4 + 2]
      const y2 = lines.data32S[i * 4 + 3]

      const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI)
      const absAngle = Math.abs(angle)

      if (absAngle < 20 || absAngle > 160) {
        // Horizontal-ish (within 20° of horizontal)
        horizontalLines.push({ x1, y1, x2, y2, angle })
      } else if (absAngle > 70 && absAngle < 110) {
        // Vertical-ish (within 20° of vertical)
        verticalLines.push({ x1, y1, x2, y2, angle })
      }
    }

    stats.horizontalLines = horizontalLines.length
    stats.verticalLines = verticalLines.length

    // Need at least 2 horizontal and 2 vertical lines
    if (horizontalLines.length < 2 || verticalLines.length < 2) {
      src.delete()
      gray.delete()
      lines.delete()
      return { quad: undefined, stats }
    }

    // Sort lines by position
    horizontalLines.sort((a, b) => (a.y1 + a.y2) / 2 - (b.y1 + b.y2) / 2)
    verticalLines.sort((a, b) => (a.x1 + a.x2) / 2 - (b.x1 + b.x2) / 2)

    // Take outermost lines
    const topLine = horizontalLines[0]
    const bottomLine = horizontalLines[horizontalLines.length - 1]
    const leftLine = verticalLines[0]
    const rightLine = verticalLines[verticalLines.length - 1]

    if (!topLine || !bottomLine || !leftLine || !rightLine) {
      src.delete()
      gray.delete()
      lines.delete()
      return { quad: undefined, stats }
    }

    // Calculate intersections to form quadrilateral
    const topLeft = lineIntersection(topLine, leftLine)
    const topRight = lineIntersection(topLine, rightLine)
    const bottomRight = lineIntersection(bottomLine, rightLine)
    const bottomLeft = lineIntersection(bottomLine, leftLine)

    if (!topLeft || !topRight || !bottomRight || !bottomLeft) {
      src.delete()
      gray.delete()
      lines.delete()
      return { quad: undefined, stats }
    }

    // Check if quad area is within acceptable range
    const frameWidth = gray.cols
    const frameHeight = gray.rows
    const frameArea = frameWidth * frameHeight
    const minArea = minAreaPercent * frameArea
    const maxArea = 0.95 * frameArea // Allow larger documents, but reject full-screen

    // Calculate approximate quad area
    const width1 = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y)
    const width2 = Math.hypot(
      bottomRight.x - bottomLeft.x,
      bottomRight.y - bottomLeft.y,
    )
    const height1 = Math.hypot(
      bottomLeft.x - topLeft.x,
      bottomLeft.y - topLeft.y,
    )
    const height2 = Math.hypot(
      bottomRight.x - topRight.x,
      bottomRight.y - topRight.y,
    )
    const avgWidth = (width1 + width2) / 2
    const avgHeight = (height1 + height2) / 2
    const quadArea = avgWidth * avgHeight

    if (quadArea < minArea || quadArea > maxArea) {
      src.delete()
      gray.delete()
      lines.delete()
      return { quad: undefined, stats }
    }

    stats.quadDetected = true

    // Return quad as flat array [x0, y0, x1, y1, x2, y2, x3, y3]
    const quad = [
      topLeft.x,
      topLeft.y,
      topRight.x,
      topRight.y,
      bottomRight.x,
      bottomRight.y,
      bottomLeft.x,
      bottomLeft.y,
    ]

    // Cleanup
    src.delete()
    gray.delete()
    lines.delete()

    return { quad, stats }
  } catch (error) {
    console.error('Error in Hough Lines detection:', error)
    return { quad: undefined, stats }
  }
}

/**
 * Order quad points in clockwise order starting from top-left
 */
export function orderQuad(pts: number[] | undefined): number[] | undefined {
  if (!pts || pts.length !== 8) return undefined

  const points = [
    { x: pts[0], y: pts[1] },
    { x: pts[2], y: pts[3] },
    { x: pts[4], y: pts[5] },
    { x: pts[6], y: pts[7] },
  ]

  // Calculate centroid
  const cx = points.reduce((sum, p) => sum + (p?.x ?? 0), 0) / 4
  const cy = points.reduce((sum, p) => sum + (p?.y ?? 0), 0) / 4

  // Sort by angle from centroid
  const sorted = points
    .slice()
    .sort(
      (a, b) =>
        Math.atan2((a?.y ?? 0) - cy, (a?.x ?? 0) - cx) -
        Math.atan2((b?.y ?? 0) - cy, (b?.x ?? 0) - cx),
    )

  return sorted.map((pt) => [pt?.x ?? 0, pt?.y ?? 0]).flat()
}

/**
 * Exponential Moving Average smoothing for quad coordinates
 * Reduces jitter in real-time detection
 */
export function emaQuad(
  prev: number[] | undefined,
  next: number[] | undefined,
  alpha = 0.25,
): number[] | undefined {
  if (!prev) return next
  if (!next) return prev

  const smoothed: number[] = []
  for (let i = 0; i < 8; i++) {
    smoothed[i] = (prev[i] ?? 0) + alpha * ((next[i] ?? 0) - (prev[i] ?? 0))
  }
  return smoothed
}
