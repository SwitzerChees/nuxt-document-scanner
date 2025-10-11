import type {
  DrawOverlayOptions,
  OverlayDrawStyle,
  Point,
} from '../types/Drawing'

const defaultStyle = {
  strokeColor: '#FFFFFF',
  strokeWidth: 3,
  fillColor: '#38bdf8',
  shadowBlur: 25,
  shadowColor: '#0ea5e9',
  gradient: true,
  pulse: true,
} satisfies OverlayDrawStyle

const calculateDisplayArea = (video: HTMLVideoElement) => {
  const videoAspect = video.videoWidth / video.videoHeight
  const containerAspect = video.clientWidth / video.clientHeight

  let displayWidth, displayHeight, offsetX, offsetY

  if (videoAspect > containerAspect) {
    // Video is wider - letterbox top/bottom
    displayWidth = video.clientWidth
    displayHeight = video.clientWidth / videoAspect
    offsetX = 0
    offsetY = (video.clientHeight - displayHeight) / 2
  } else {
    // Video is taller - pillarbox left/right
    displayHeight = video.clientHeight
    displayWidth = video.clientHeight * videoAspect
    offsetX = (video.clientWidth - displayWidth) / 2
    offsetY = 0
  }

  return { displayWidth, displayHeight, offsetX, offsetY }
}

export const drawOverlay = (opts: DrawOverlayOptions) => {
  const { canvas, video, corners, style } = opts

  if (!video.videoWidth || !video.videoHeight) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Size canvas to match container
  canvas.width = video.clientWidth
  canvas.height = video.clientHeight
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (!corners || corners.length !== 8) {
    return
  }

  // Calculate display area for coordinate transformation
  const { displayWidth, displayHeight, offsetX, offsetY } =
    calculateDisplayArea(video)

  const s = { ...defaultStyle, ...style } as Required<OverlayDrawStyle>

  // Transform corners from stream coordinates to display coordinates
  const scaleX = displayWidth / video.videoWidth
  const scaleY = displayHeight / video.videoHeight

  const [sx0, sy0, sx1, sy1, sx2, sy2, sx3, sy3] = corners as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]

  // Convert to display coordinates
  const x0 = sx0 * scaleX + offsetX
  const y0 = sy0 * scaleY + offsetY
  const x1 = sx1 * scaleX + offsetX
  const y1 = sy1 * scaleY + offsetY
  const x2 = sx2 * scaleX + offsetX
  const y2 = sy2 * scaleY + offsetY
  const x3 = sx3 * scaleX + offsetX
  const y3 = sy3 * scaleY + offsetY

  const time = Date.now() / 1000
  const pulse = s.pulse ? Math.sin(time * 3) * 0.3 + 0.7 : 1
  const opacityHex = Math.floor(0x66 * pulse)
    .toString(16)
    .padStart(2, '0')

  // Fancy gradient border
  if (s.gradient) {
    const grad = ctx.createLinearGradient(x0, y0, x2, y2)
    grad.addColorStop(0, s.strokeColor)
    grad.addColorStop(0.5, s.strokeColor)
    grad.addColorStop(1, s.strokeColor)
    ctx.strokeStyle = grad
  } else {
    ctx.strokeStyle = s.strokeColor
  }

  ctx.lineWidth = s.strokeWidth
  ctx.shadowBlur = s.shadowBlur
  ctx.shadowColor = s.shadowColor

  // Semi-transparent glowing fill
  ctx.fillStyle = `${s.fillColor}${opacityHex}`
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineTo(x3, y3)
  ctx.closePath()
  ctx.fill()

  // Animated border pulse
  ctx.globalAlpha = pulse
  ctx.stroke()
  ctx.globalAlpha = 1
}

export const isValidRectangle = (
  pts: number[],
  options: {
    minRectangularity?: number
    maxAspectRatio?: number
    minSideConsistency?: number
    maxAngleDeviation?: number
  } = {},
) => {
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
 * Check if a quad is convex (all corners point outward)
 * Uses cross product - all should have the same sign
 */
const isConvex = (points: Point[]): boolean => {
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
const calculateAngle = (a: Point, b: Point, c: Point) => {
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

const rectangularityScore = (pts: Point[]) => {
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

export const emaQuad = (
  prev: number[] | undefined,
  next: number[] | undefined,
  alpha = 0.8,
) => {
  if (!prev) return next
  if (!next) return prev

  const smoothed: number[] = []
  for (let i = 0; i < 8; i++) {
    smoothed[i] = (prev[i] ?? 0) + alpha * ((next[i] ?? 0) - (prev[i] ?? 0))
  }
  return smoothed
}

export const calculateQuadArea = (quad: number[]): number => {
  if (!quad || quad.length !== 8) return 0
  // Using shoelace formula for polygon area
  const x = [quad[0], quad[2], quad[4], quad[6]]
  const y = [quad[1], quad[3], quad[5], quad[7]]
  let area = 0
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    area += x[i]! * y[j]! - x[j]! * y[i]!
  }
  return Math.abs(area / 2)
}

export const calculateSignificantChange = (
  prev: number,
  next: number,
  threshold: number,
) => {
  if (prev == 0) return false
  const change = Math.abs(next - prev) / Math.max(prev, 1)
  return change > threshold
}
