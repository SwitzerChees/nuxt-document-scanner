/**
 * Edge Detection Utilities
 * Hybrid approach: Contour detection (primary) + Hough Lines (fallback)
 */

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
  alpha = 0.95,
): number[] | undefined {
  if (!prev) return next
  if (!next) return prev

  const smoothed: number[] = []
  for (let i = 0; i < 8; i++) {
    smoothed[i] = (prev[i] ?? 0) + alpha * ((next[i] ?? 0) - (prev[i] ?? 0))
  }
  return smoothed
}
