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

  // Default parameters (slightly more sensitive defaults; real values come from module.ts)
  const houghThreshold = params.houghThreshold ?? 30
  const minLineLength = params.minLineLength ?? 20
  const maxLineGap = params.maxLineGap ?? 15
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

    // Build enriched lines with angle and length
    const allLines: Array<{
      x1: number
      y1: number
      x2: number
      y2: number
      angle: number
      absAngle: number
      length: number
    }> = []

    for (let i = 0; i < lines.rows; i++) {
      const x1 = lines.data32S[i * 4]
      const y1 = lines.data32S[i * 4 + 1]
      const x2 = lines.data32S[i * 4 + 2]
      const y2 = lines.data32S[i * 4 + 3]
      const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
      const absAngle = Math.abs(angle)
      const length = Math.hypot(x2 - x1, y2 - y1)
      allLines.push({ x1, y1, x2, y2, angle, absAngle, length })
    }

    // Group by orientation (permissive), then relax if needed
    const horizontalLines: typeof allLines = []
    const verticalLines: typeof allLines = []
    for (const l of allLines) {
      if (l.absAngle < 30 || l.absAngle > 150) horizontalLines.push(l)
      else if (l.absAngle > 60 && l.absAngle < 120) verticalLines.push(l)
    }

    if (horizontalLines.length < 2 || verticalLines.length < 2) {
      horizontalLines.length = 0
      verticalLines.length = 0
      for (const l of allLines) {
        if (l.absAngle < 40 || l.absAngle > 140) horizontalLines.push(l)
        else if (l.absAngle > 50 && l.absAngle < 130) verticalLines.push(l)
      }
    }

    stats.horizontalLines = horizontalLines.length
    stats.verticalLines = verticalLines.length

    if (horizontalLines.length < 2 || verticalLines.length < 2) {
      src.delete()
      gray.delete()
      lines.delete()
      return { quad: undefined, stats }
    }

    // Sort strongest first
    horizontalLines.sort((a, b) => b.length - a.length)
    verticalLines.sort((a, b) => b.length - a.length)

    const frameWidth = gray.cols
    const frameHeight = gray.rows
    const frameArea = frameWidth * frameHeight
    const minArea = minAreaPercent * frameArea
    const maxArea = 0.95 * frameArea

    // Utility scores
    function rectangularityScore(pts: Array<{ x: number; y: number }>): number {
      function angle(a: any, b: any, c: any): number {
        const abx = a.x - b.x
        const aby = a.y - b.y
        const cbx = c.x - b.x
        const cby = c.y - b.y
        const dot = abx * cbx + aby * cby
        const mag1 = Math.hypot(abx, aby)
        const mag2 = Math.hypot(cbx, cby)
        if (mag1 === 0 || mag2 === 0) return 0
        const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)))
        return Math.acos(cos) * (180 / Math.PI)
      }
      const a0 = angle(pts[3], pts[0], pts[1])
      const a1 = angle(pts[0], pts[1], pts[2])
      const a2 = angle(pts[1], pts[2], pts[3])
      const a3 = angle(pts[2], pts[3], pts[0])
      const dev =
        Math.abs(90 - a0) +
        Math.abs(90 - a1) +
        Math.abs(90 - a2) +
        Math.abs(90 - a3)
      return Math.max(0, 1 - dev / 90)
    }

    const K = 4
    const hCandidates = horizontalLines.slice(0, K)
    const vCandidates = verticalLines.slice(0, K)

    let bestQuad: number[] | undefined
    let bestScore = -Infinity

    for (let hi = 0; hi < hCandidates.length; hi++) {
      for (let hj = hi + 1; hj < hCandidates.length; hj++) {
        const topLine = hCandidates[hi]
        const bottomLine = hCandidates[hj]
        if (!topLine || !bottomLine) continue

        for (let vi = 0; vi < vCandidates.length; vi++) {
          for (let vj = vi + 1; vj < vCandidates.length; vj++) {
            const leftLine = vCandidates[vi]
            const rightLine = vCandidates[vj]
            if (!leftLine || !rightLine) continue

            const topLeft = lineIntersection(topLine, leftLine)
            const topRight = lineIntersection(topLine, rightLine)
            const bottomRight = lineIntersection(bottomLine, rightLine)
            const bottomLeft = lineIntersection(bottomLine, leftLine)
            if (!topLeft || !topRight || !bottomRight || !bottomLeft) continue

            // Bounds check (with small tolerance)
            const points = [topLeft, topRight, bottomRight, bottomLeft]
            if (
              points.some(
                (p) =>
                  p.x < -5 ||
                  p.x > frameWidth + 5 ||
                  p.y < -5 ||
                  p.y > frameHeight + 5,
              )
            )
              continue

            // Area and shape checks
            const width1 = Math.hypot(
              topRight.x - topLeft.x,
              topRight.y - topLeft.y,
            )
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
            if (quadArea < minArea || quadArea > maxArea) continue

            // Aspect ratio constraint to avoid extreme shapes
            const aspect = avgWidth / Math.max(1e-3, avgHeight)
            if (aspect < 0.55 || aspect > 1.85) continue

            // Scores
            const rectScore = rectangularityScore(points)
            if (rectScore < 0.35) continue
            const areaScore = Math.min(1, quadArea / (0.75 * frameArea))
            const edgeLenScore = Math.min(
              1,
              (avgWidth + avgHeight) / (frameWidth + frameHeight),
            )
            const cx =
              (topLeft.x + topRight.x + bottomRight.x + bottomLeft.x) / 4
            const cy =
              (topLeft.y + topRight.y + bottomRight.y + bottomLeft.y) / 4
            const dx = cx - frameWidth / 2
            const dy = cy - frameHeight / 2
            const centerDist = Math.hypot(dx, dy)
            const maxCenter = Math.hypot(frameWidth / 2, frameHeight / 2)
            const centerScore = 1 - Math.min(1, centerDist / maxCenter)

            const score =
              0.35 * areaScore +
              0.45 * rectScore +
              0.15 * centerScore +
              0.05 * edgeLenScore

            if (score > bestScore) {
              bestScore = score
              bestQuad = [
                topLeft.x,
                topLeft.y,
                topRight.x,
                topRight.y,
                bottomRight.x,
                bottomRight.y,
                bottomLeft.x,
                bottomLeft.y,
              ]
            }
          }
        }
      }
    }

    if (bestQuad) {
      stats.quadDetected = true
      src.delete()
      gray.delete()
      lines.delete()
      return { quad: bestQuad, stats }
    }

    // No suitable candidate
    src.delete()
    gray.delete()
    lines.delete()
    return { quad: undefined, stats }
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
