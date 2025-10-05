/**
 * Edge Detection Utilities
 * Hybrid approach: Contour detection (primary) + Hough Lines (fallback)
 */

import { getCV, isOpenCVReady } from './opencv-loader'

export interface EdgeDetectionParams {
  houghThreshold?: number
  minLineLength?: number
  maxLineGap?: number
  minAreaPercent?: number
  maxAreaPercent?: number
  minRectangularity?: number
  useContours?: boolean
}

export interface DetectionStats {
  horizontalLines: number
  verticalLines: number
  quadDetected: boolean
  method?: 'contour' | 'hough' | 'none'
  contoursFound?: number
  confidence?: number
}

interface Point {
  x: number
  y: number
}

/**
 * Calculate intersection point of two lines
 */
function lineIntersection(
  line1: { x1: number; y1: number; x2: number; y2: number },
  line2: { x1: number; y1: number; x2: number; y2: number },
): Point | undefined {
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
 * Check if a quad is convex (all corners point outward)
 * Uses cross product - all should have the same sign
 */
function isConvex(points: Point[]): boolean {
  if (points.length !== 4) return false

  const crossProducts: number[] = []
  for (let i = 0; i < 4; i++) {
    const p1 = points[i]!
    const p2 = points[(i + 1) % 4]!
    const p3 = points[(i + 2) % 4]!

    const dx1 = p2.x - p1.x
    const dy1 = p2.y - p1.y
    const dx2 = p3.x - p2.x
    const dy2 = p3.y - p2.y

    const cross = dx1 * dy2 - dy1 * dx2
    crossProducts.push(cross)
  }

  // All should have same sign (all positive or all negative)
  const allPositive = crossProducts.every((c) => c > 0)
  const allNegative = crossProducts.every((c) => c < 0)

  return allPositive || allNegative
}

/**
 * Calculate angle between three points (in degrees)
 */
function calculateAngle(a: Point, b: Point, c: Point): number {
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

/**
 * Improved rectangularity score with stricter requirements
 */
function rectangularityScore(pts: Point[]): number {
  if (pts.length !== 4) return 0

  // Calculate all corner angles
  const a0 = calculateAngle(pts[3]!, pts[0]!, pts[1]!)
  const a1 = calculateAngle(pts[0]!, pts[1]!, pts[2]!)
  const a2 = calculateAngle(pts[1]!, pts[2]!, pts[3]!)
  const a3 = calculateAngle(pts[2]!, pts[3]!, pts[0]!)

  // Reject if any angle is too acute (< 60°) or too obtuse (> 120°)
  if (
    a0 < 60 ||
    a0 > 120 ||
    a1 < 60 ||
    a1 > 120 ||
    a2 < 60 ||
    a2 > 120 ||
    a3 < 60 ||
    a3 > 120
  ) {
    return 0
  }

  // Calculate deviation from perfect 90° angles
  const totalDev =
    Math.abs(90 - a0) +
    Math.abs(90 - a1) +
    Math.abs(90 - a2) +
    Math.abs(90 - a3)

  // Stricter scoring: penalize more for deviation
  // Perfect rectangle = 1.0, anything with > 80° total deviation = 0
  return Math.max(0, 1 - totalDev / 80)
}

/**
 * Check if two lines are roughly parallel
 */
function areLinesParallel(line1: any, line2: any, maxAngleDiff = 15): boolean {
  const angleDiff = Math.abs(line1.angle - line2.angle)
  return angleDiff < maxAngleDiff || angleDiff > 180 - maxAngleDiff
}

/**
 * Calculate perpendicularity score (how close to 90° are horizontal and vertical lines)
 */
function perpendicularityScore(hLine: any, vLine: any): number {
  let angleDiff = Math.abs(Math.abs(hLine.angle - vLine.angle) - 90)
  if (angleDiff > 90) angleDiff = 180 - angleDiff
  // Perfect perpendicular = 1.0, 30° off = 0
  return Math.max(0, 1 - angleDiff / 30)
}

/**
 * Merge similar lines (reduces noise)
 */
function mergeSimilarLines(
  lines: Array<{
    x1: number
    y1: number
    x2: number
    y2: number
    angle: number
    absAngle: number
    length: number
  }>,
  angleThreshold = 10,
  distanceThreshold = 20,
): typeof lines {
  if (lines.length === 0) return []

  const merged: typeof lines = []
  const used = new Set<number>()

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue

    const line1 = lines[i]!
    const group = [line1]
    used.add(i)

    // Find similar lines
    for (let j = i + 1; j < lines.length; j++) {
      if (used.has(j)) continue

      const line2 = lines[j]!

      // Check if angles are similar
      const angleDiff = Math.abs(line1.angle - line2.angle)
      if (angleDiff > angleThreshold && angleDiff < 180 - angleThreshold)
        continue

      // Check if lines are close (midpoint distance)
      const mid1x = (line1.x1 + line1.x2) / 2
      const mid1y = (line1.y1 + line1.y2) / 2
      const mid2x = (line2.x1 + line2.x2) / 2
      const mid2y = (line2.y1 + line2.y2) / 2
      const dist = Math.hypot(mid2x - mid1x, mid2y - mid1y)

      if (dist < distanceThreshold) {
        group.push(line2)
        used.add(j)
      }
    }

    // Merge the group into a single representative line (longest)
    group.sort((a, b) => b.length - a.length)
    merged.push(group[0]!)
  }

  return merged
}

/**
 * Detect document using contour-based method (primary)
 * More robust for clear document edges
 */
function detectQuadWithContours(
  edgeImage: ImageData,
  params: EdgeDetectionParams,
  frameWidth: number,
  frameHeight: number,
): { quad: number[] | undefined; confidence: number; contoursFound: number } {
  const cv = getCV()
  const minAreaPercent = params.minAreaPercent ?? 0.08
  const maxAreaPercent = params.maxAreaPercent ?? 0.92
  const minRectangularity = params.minRectangularity ?? 0.7

  try {
    const src = cv.matFromImageData(edgeImage)
    const gray = new cv.Mat()
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

    // Enhanced preprocessing: bilateral filter to reduce noise while preserving edges
    const blurred = new cv.Mat()
    cv.bilateralFilter(gray, blurred, 5, 75, 75)

    // Morphological operations to close gaps and improve contour detection
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5))
    const closed = new cv.Mat()
    cv.morphologyEx(blurred, closed, cv.MORPH_CLOSE, kernel)
    cv.dilate(closed, closed, kernel, new cv.Point(-1, -1), 1)

    // Find contours
    const contours = new cv.MatVector()
    const hierarchy = new cv.Mat()
    cv.findContours(
      closed,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    )

    const frameArea = frameWidth * frameHeight
    const minArea = minAreaPercent * frameArea
    const maxArea = maxAreaPercent * frameArea

    let bestQuad: number[] | undefined
    let bestConfidence = 0
    const contoursFound = contours.size()

    // Sort contours by area (largest first)
    const contourData: Array<{ idx: number; area: number; arcLength: number }> =
      []
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i)
      const area = cv.contourArea(contour)
      const arcLength = cv.arcLength(contour, true)
      if (area >= minArea && area <= maxArea) {
        contourData.push({ idx: i, area, arcLength })
      }
    }

    // Sort by area descending
    contourData.sort((a, b) => b.area - a.area)

    // Try the largest contours (up to 5)
    for (const data of contourData.slice(0, 5)) {
      const contour = contours.get(data.idx)

      // Approximate contour to polygon
      const epsilon = 0.02 * data.arcLength
      const approx = new cv.Mat()
      cv.approxPolyDP(contour, approx, epsilon, true)

      // Must be a quadrilateral
      if (approx.rows === 4) {
        const points: Point[] = []
        for (let j = 0; j < 4; j++) {
          const x = approx.data32S[j * 2]
          const y = approx.data32S[j * 2 + 1]
          points.push({ x, y })
        }

        // Validate quad geometry
        if (!isConvex(points)) {
          approx.delete()
          continue
        }

        const rectScore = rectangularityScore(points)
        if (rectScore < minRectangularity) {
          approx.delete()
          continue
        }

        // Calculate side lengths
        const side1 = Math.hypot(
          points[1]!.x - points[0]!.x,
          points[1]!.y - points[0]!.y,
        )
        const side2 = Math.hypot(
          points[2]!.x - points[1]!.x,
          points[2]!.y - points[1]!.y,
        )
        const side3 = Math.hypot(
          points[3]!.x - points[2]!.x,
          points[3]!.y - points[2]!.y,
        )
        const side4 = Math.hypot(
          points[0]!.x - points[3]!.x,
          points[0]!.y - points[3]!.y,
        )

        // Check aspect ratio (opposite sides should be similar)
        const avgWidth = (side1 + side3) / 2
        const avgHeight = (side2 + side4) / 2
        const aspect =
          Math.max(avgWidth, avgHeight) / Math.min(avgWidth, avgHeight)

        // Allow aspect ratios common for documents: 1:1 to 2:1 (square to A4-like)
        if (aspect > 2.2) {
          approx.delete()
          continue
        }

        // Side length consistency (opposite sides should be similar)
        const widthRatio = Math.min(side1, side3) / Math.max(side1, side3)
        const heightRatio = Math.min(side2, side4) / Math.max(side2, side4)
        if (widthRatio < 0.7 || heightRatio < 0.7) {
          approx.delete()
          continue
        }

        // Calculate confidence score
        const areaScore = Math.min(1, data.area / (0.75 * frameArea))
        const aspectScore = Math.max(0, 1 - (aspect - 1) / 1.5) // Prefer aspect closer to 1
        const sideConsistencyScore = (widthRatio + heightRatio) / 2

        const confidence =
          0.4 * rectScore +
          0.3 * areaScore +
          0.2 * aspectScore +
          0.1 * sideConsistencyScore

        if (confidence > bestConfidence) {
          bestConfidence = confidence
          bestQuad = points.flatMap((p) => [p.x, p.y])
        }
      }

      approx.delete()
    }

    // Cleanup
    src.delete()
    gray.delete()
    blurred.delete()
    closed.delete()
    kernel.delete()
    contours.delete()
    hierarchy.delete()

    return { quad: bestQuad, confidence: bestConfidence, contoursFound }
  } catch (error) {
    console.error('Error in contour detection:', error)
    return { quad: undefined, confidence: 0, contoursFound: 0 }
  }
}

/**
 * Improved Hough Lines detection with stricter validation
 * Used as fallback when contour detection fails
 */
function detectQuadWithHoughLinesInternal(
  edgeImage: ImageData,
  params: EdgeDetectionParams,
  frameWidth: number,
  frameHeight: number,
): { quad: number[] | undefined; stats: DetectionStats } {
  const cv = getCV()
  const stats: DetectionStats = {
    horizontalLines: 0,
    verticalLines: 0,
    quadDetected: false,
    method: 'hough',
  }

  const houghThreshold = params.houghThreshold ?? 40
  const minLineLength = params.minLineLength ?? 30
  const maxLineGap = params.maxLineGap ?? 20
  const minAreaPercent = params.minAreaPercent ?? 0.08
  const maxAreaPercent = params.maxAreaPercent ?? 0.92
  const minRectangularity = params.minRectangularity ?? 0.7

  try {
    const src = cv.matFromImageData(edgeImage)
    const gray = new cv.Mat()
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

    // Apply Hough Line Transform
    const lines = new cv.Mat()
    cv.HoughLinesP(
      gray,
      lines,
      1,
      Math.PI / 180,
      houghThreshold,
      minLineLength,
      maxLineGap,
    )

    if (lines.rows < 4) {
      src.delete()
      gray.delete()
      lines.delete()
      return { quad: undefined, stats }
    }

    // Parse and categorize lines with STRICT angle thresholds
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

      // Filter out very short lines
      if (length < minLineLength) continue

      allLines.push({ x1, y1, x2, y2, angle, absAngle, length })
    }

    // Strict horizontal/vertical classification
    let horizontalLines = allLines.filter(
      (l) => l.absAngle < 20 || l.absAngle > 160,
    )
    let verticalLines = allLines.filter(
      (l) => l.absAngle > 70 && l.absAngle < 110,
    )

    // Merge similar lines to reduce noise and improve detection
    horizontalLines = mergeSimilarLines(horizontalLines, 10, 30)
    verticalLines = mergeSimilarLines(verticalLines, 10, 30)

    stats.horizontalLines = horizontalLines.length
    stats.verticalLines = verticalLines.length

    if (horizontalLines.length < 2 || verticalLines.length < 2) {
      src.delete()
      gray.delete()
      lines.delete()
      return { quad: undefined, stats }
    }

    // Sort by length
    horizontalLines.sort((a, b) => b.length - a.length)
    verticalLines.sort((a, b) => b.length - a.length)

    const frameArea = frameWidth * frameHeight
    const minArea = minAreaPercent * frameArea
    const maxArea = maxAreaPercent * frameArea

    let bestQuad: number[] | undefined
    let bestScore = -Infinity

    // Try top candidates (reduced from 4 to 3 for performance)
    const K = 3
    const hCandidates = horizontalLines.slice(0, K)
    const vCandidates = verticalLines.slice(0, K)

    for (let hi = 0; hi < hCandidates.length; hi++) {
      for (let hj = hi + 1; hj < hCandidates.length; hj++) {
        const topLine = hCandidates[hi]!
        const bottomLine = hCandidates[hj]!

        // Lines should be roughly parallel
        if (!areLinesParallel(topLine, bottomLine, 20)) continue

        // Lines should be reasonably separated
        const avgY1 = (topLine.y1 + topLine.y2) / 2
        const avgY2 = (bottomLine.y1 + bottomLine.y2) / 2
        if (Math.abs(avgY2 - avgY1) < frameHeight * 0.15) continue

        for (let vi = 0; vi < vCandidates.length; vi++) {
          for (let vj = vi + 1; vj < vCandidates.length; vj++) {
            const leftLine = vCandidates[vi]!
            const rightLine = vCandidates[vj]!

            // Lines should be roughly parallel
            if (!areLinesParallel(leftLine, rightLine, 20)) continue

            // Lines should be reasonably separated
            const avgX1 = (leftLine.x1 + leftLine.x2) / 2
            const avgX2 = (rightLine.x1 + rightLine.x2) / 2
            if (Math.abs(avgX2 - avgX1) < frameWidth * 0.15) continue

            // Check perpendicularity
            const perpScore = perpendicularityScore(topLine, leftLine)
            if (perpScore < 0.6) continue

            // Calculate intersections
            const topLeft = lineIntersection(topLine, leftLine)
            const topRight = lineIntersection(topLine, rightLine)
            const bottomRight = lineIntersection(bottomLine, rightLine)
            const bottomLeft = lineIntersection(bottomLine, leftLine)

            if (!topLeft || !topRight || !bottomRight || !bottomLeft) continue

            const points = [topLeft, topRight, bottomRight, bottomLeft]

            // Strict bounds check
            if (
              points.some(
                (p) =>
                  p.x < -10 ||
                  p.x > frameWidth + 10 ||
                  p.y < -10 ||
                  p.y > frameHeight + 10,
              )
            ) {
              continue
            }

            // Convexity check
            if (!isConvex(points)) continue

            // Calculate area
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

            // Aspect ratio check
            const aspect =
              Math.max(avgWidth, avgHeight) / Math.min(avgWidth, avgHeight)
            if (aspect > 2.2) continue

            // Rectangularity check (STRICT)
            const rectScore = rectangularityScore(points)
            if (rectScore < minRectangularity) continue

            // Side consistency
            const widthRatio =
              Math.min(width1, width2) / Math.max(width1, width2)
            const heightRatio =
              Math.min(height1, height2) / Math.max(height1, height2)
            if (widthRatio < 0.7 || heightRatio < 0.7) continue

            // Calculate overall score
            const areaScore = Math.min(1, quadArea / (0.75 * frameArea))
            const aspectScore = Math.max(0, 1 - (aspect - 1) / 1.5)
            const sideConsistencyScore = (widthRatio + heightRatio) / 2

            const score =
              0.4 * rectScore +
              0.25 * areaScore +
              0.2 * perpScore +
              0.1 * aspectScore +
              0.05 * sideConsistencyScore

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
      stats.confidence = bestScore
    }

    src.delete()
    gray.delete()
    lines.delete()

    return { quad: bestQuad, stats }
  } catch (error) {
    console.error('Error in Hough Lines detection:', error)
    return { quad: undefined, stats }
  }
}

/**
 * Main detection function with hybrid approach
 * Tries contours first, falls back to Hough Lines
 */
export function detectQuadWithHoughLines(
  edgeImage: ImageData,
  params: EdgeDetectionParams = {},
): { quad: number[] | undefined; stats: DetectionStats } {
  if (!isOpenCVReady()) {
    console.warn('OpenCV not ready')
    return {
      quad: undefined,
      stats: {
        horizontalLines: 0,
        verticalLines: 0,
        quadDetected: false,
        method: 'none',
      },
    }
  }

  const frameWidth = edgeImage.width
  const frameHeight = edgeImage.height
  const useContours = params.useContours ?? true

  // Try contour detection first (more robust)
  if (useContours) {
    const contourResult = detectQuadWithContours(
      edgeImage,
      params,
      frameWidth,
      frameHeight,
    )

    // Lower confidence threshold from 0.6 to 0.55 for better detection rate
    if (contourResult.quad && contourResult.confidence > 0.55) {
      return {
        quad: contourResult.quad,
        stats: {
          horizontalLines: 0,
          verticalLines: 0,
          quadDetected: true,
          method: 'contour',
          contoursFound: contourResult.contoursFound,
          confidence: contourResult.confidence,
        },
      }
    }
  }

  // Fall back to Hough Lines
  const houghResult = detectQuadWithHoughLinesInternal(
    edgeImage,
    params,
    frameWidth,
    frameHeight,
  )

  // Only return Hough result if confidence is reasonable
  if (
    houghResult.quad &&
    houghResult.stats.confidence &&
    houghResult.stats.confidence > 0.5
  ) {
    return houghResult
  }

  // If Hough confidence is too low, return no detection
  return {
    quad: undefined,
    stats: {
      horizontalLines: houghResult.stats.horizontalLines,
      verticalLines: houghResult.stats.verticalLines,
      quadDetected: false,
      method: 'none',
      confidence: houghResult.stats.confidence,
    },
  }
}

/**
 * Validate that a quad forms a proper rectangle or square
 * More strict validation for document detection
 */
export function isValidRectangle(
  pts: number[],
  options: {
    minRectangularity?: number
    maxAspectRatio?: number
    minSideConsistency?: number
    maxAngleDeviation?: number
  } = {},
): boolean {
  if (!pts || pts.length !== 8) return false

  const {
    minRectangularity = 0.8, // Higher threshold for stricter rectangle validation
    maxAspectRatio = 2.5, // Allow slightly more elongated rectangles for documents
    minSideConsistency = 0.75, // Opposite sides should be more similar
    maxAngleDeviation = 25, // Maximum angle deviation from 90 degrees
  } = options

  const points: Point[] = [
    { x: pts[0]!, y: pts[1]! },
    { x: pts[2]!, y: pts[3]! },
    { x: pts[4]!, y: pts[5]! },
    { x: pts[6]!, y: pts[7]! },
  ]

  // Must be convex
  if (!isConvex(points)) return false

  // Check rectangularity score (angles close to 90 degrees)
  const rectScore = rectangularityScore(points)
  if (rectScore < minRectangularity) return false

  // Calculate side lengths
  const side1 = Math.hypot(
    points[1]!.x - points[0]!.x,
    points[1]!.y - points[0]!.y,
  )
  const side2 = Math.hypot(
    points[2]!.x - points[1]!.x,
    points[2]!.y - points[1]!.y,
  )
  const side3 = Math.hypot(
    points[3]!.x - points[2]!.x,
    points[3]!.y - points[2]!.y,
  )
  const side4 = Math.hypot(
    points[0]!.x - points[3]!.x,
    points[0]!.y - points[3]!.y,
  )

  // Check aspect ratio (opposite sides should be similar)
  const avgWidth = (side1 + side3) / 2
  const avgHeight = (side2 + side4) / 2
  const aspect = Math.max(avgWidth, avgHeight) / Math.min(avgWidth, avgHeight)

  if (aspect > maxAspectRatio) return false

  // Side length consistency (opposite sides should be similar)
  const widthRatio = Math.min(side1, side3) / Math.max(side1, side3)
  const heightRatio = Math.min(side2, side4) / Math.max(side2, side4)

  if (widthRatio < minSideConsistency || heightRatio < minSideConsistency)
    return false

  // Additional check: ensure adjacent sides are roughly perpendicular
  const angle1 = calculateAngle(points[0]!, points[1]!, points[2]!)
  const angle2 = calculateAngle(points[1]!, points[2]!, points[3]!)
  const angle3 = calculateAngle(points[2]!, points[3]!, points[0]!)
  const angle4 = calculateAngle(points[3]!, points[0]!, points[1]!)

  const angles = [angle1, angle2, angle3, angle4]
  for (const angle of angles) {
    if (Math.abs(90 - angle) > maxAngleDeviation) return false
  }

  return true
}

/**
 * Order quad points consistently: top-left, top-right, bottom-right, bottom-left
 */
export function orderQuad(pts: number[] | undefined): number[] | undefined {
  if (!pts || pts.length !== 8) return undefined

  const points = [
    { x: pts[0]!, y: pts[1]! },
    { x: pts[2]!, y: pts[3]! },
    { x: pts[4]!, y: pts[5]! },
    { x: pts[6]!, y: pts[7]! },
  ]

  // Sort by Y coordinate first (top to bottom)
  points.sort((a, b) => a.y - b.y)

  // Top two points
  const topPoints = points.slice(0, 2)
  // Bottom two points
  const bottomPoints = points.slice(2, 4)

  // Sort top points by X (left to right)
  topPoints.sort((a, b) => a.x - b.x)
  const topLeft = topPoints[0]!
  const topRight = topPoints[1]!

  // Sort bottom points by X (left to right)
  bottomPoints.sort((a, b) => a.x - b.x)
  const bottomLeft = bottomPoints[0]!
  const bottomRight = bottomPoints[1]!

  // Return in consistent order: TL, TR, BR, BL
  return [
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
