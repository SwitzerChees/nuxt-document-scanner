export type Point = {
  x: number;
  y: number;
}
/** Document corners, always ordered top-left, top-right, bottom-right, bottom-left. */
export type Quad = [
  Point,
  Point,
  Point,
  Point
]
export type Size = {
  width: number;
  height: number;
}
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
export const quadArea = (quad: Quad) => {
  let area = 0

  for (let i = 0; i < 4; i++) {
    const a = quad[i]!

    const b = quad[(i + 1) % 4]!

    area += a.x * b.y - b.x * a.y
  }

  return Math.abs(area) / 2
}
export const quadCenter = (quad: Quad): Point => ({
  x: (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4,
  y: (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4,
})
/** Orders four points clockwise (in screen coordinates) starting with the one closest to the top-left. */
export const orderQuad = (points: Point[]): Quad => {
  const center = {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  }

  const clockwise = [...points].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x))

  let start = 0

  for (let i = 1; i < clockwise.length; i++) {
    if (clockwise[i]!.x + clockwise[i]!.y < clockwise[start]!.x + clockwise[start]!.y)
      start = i
  }

  return [0, 1, 2, 3].map((i) => clockwise[(start + i) % 4]!) as Quad
}
export const isConvex = (quad: Quad) => {
  let sign = 0

  for (let i = 0; i < 4; i++) {
    const a = quad[i]!

    const b = quad[(i + 1) % 4]!

    const c = quad[(i + 2) % 4]!

    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)

    if (cross === 0)
      return false

    if (sign === 0)
      sign = Math.sign(cross)
    else if (Math.sign(cross) !== sign)
      return false
  }

  return true
}
/** Interior angle at each corner, in degrees. */
export const cornerAngles = (quad: Quad) => quad.map((corner, i) => {
  const prev = quad[(i + 3) % 4]!

  const next = quad[(i + 1) % 4]!

  const a = Math.atan2(prev.y - corner.y, prev.x - corner.x)

  const b = Math.atan2(next.y - corner.y, next.x - corner.x)

  let angle = Math.abs(a - b) * (180 / Math.PI)

  if (angle > 180)
    angle = 360 - angle

  return angle
})
export type PlausibilityOptions = {
  /** Smallest share of the frame the document may cover. */
  minAreaRatio?: number;
  /** Allowed deviation of every corner angle from 90°. Perspective makes real pages deviate a lot. */
  maxAngleDeviation?: number;
  /** Longest side / shortest side; receipts are long, but not 1:8. */
  maxSideRatio?: number;
}
/** Rejects shapes that cannot be a photographed sheet: concave, tiny, degenerate or sliver-like quads. */
export const isPlausibleDocument = (quad: Quad, frame: Size, options: PlausibilityOptions = {}) => {
  const { minAreaRatio = 0.04, maxAngleDeviation = 50, maxSideRatio = 6 } = options

  if (!isConvex(quad))
    return false

  if (quadArea(quad) < minAreaRatio * frame.width * frame.height)
    return false

  if (cornerAngles(quad).some((angle) => Math.abs(angle - 90) > maxAngleDeviation))
    return false

  const sides = quad.map((p, i) => distance(p, quad[(i + 1) % 4]!))

  return Math.max(...sides) / Math.max(1e-6, Math.min(...sides)) <= maxSideRatio
}
export const scaleQuad = (quad: Quad, scaleX: number, scaleY = scaleX): Quad => quad.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY })) as Quad
/** Largest distance any corner moved between two quads. */
export const maxCornerShift = (a: Quad, b: Quad) => Math.max(...a.map((p, i) => distance(p, b[i]!)))
export const clampQuad = (quad: Quad, frame: Size): Quad => quad.map((p) => ({ x: Math.min(frame.width, Math.max(0, p.x)), y: Math.min(frame.height, Math.max(0, p.y)) })) as Quad
export const fullFrameQuad = (frame: Size, inset = 0): Quad => [
  { x: inset, y: inset },
  { x: frame.width - inset, y: inset },
  { x: frame.width - inset, y: frame.height - inset },
  { x: inset, y: frame.height - inset },
]
/** Output size of the rectified page: the longer of each pair of opposite sides, capped to `maxLongEdge`. */
export const rectifiedSize = (quad: Quad, maxLongEdge: number): Size => {
  const width = Math.max(distance(quad[0], quad[1]), distance(quad[3], quad[2]))

  const height = Math.max(distance(quad[0], quad[3]), distance(quad[1], quad[2]))

  const scale = Math.min(1, maxLongEdge / Math.max(width, height))

  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
/** 3x3 projective transform, row-major, h[8] normalised to 1. */
export type Homography = Float64Array
/** Solves the homography that maps each `from` corner onto the matching `to` corner. */
export const solveHomography = (from: Quad, to: Quad): Homography => {
  // Eight equations in h0..h7 (h8 = 1), solved by Gaussian elimination with partial pivoting.

  const m: number[][] = []

  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]!

    const { x: u, y: v } = to[i]!

    m.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])

    m.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }

  for (let col = 0; col < 8; col++) {
    let pivot = col

    for (let row = col + 1; row < 8; row++) {
      if (Math.abs(m[row]![col]!) > Math.abs(m[pivot]![col]!))
        pivot = row
    }

    if (Math.abs(m[pivot]![col]!) < 1e-12)
      throw new Error('Degenerate quad: no homography');

    [m[col], m[pivot]] = [m[pivot]!, m[col]!]

    for (let row = 0; row < 8; row++) {
      if (row === col)
        continue

      const factor = m[row]![col]! / m[col]![col]!

      if (factor === 0)
        continue

      for (let k = col; k < 9; k++)
        m[row]![k]! -= factor * m[col]![k]!
    }
  }

  const h = new Float64Array(9)

  for (let i = 0; i < 8; i++)
    h[i] = m[i]![8]! / m[i]![i]!

  h[8] = 1

  return h
}
export const applyHomography = (h: Homography, p: Point): Point => {
  const w = h[6]! * p.x + h[7]! * p.y + h[8]!

  return { x: (h[0]! * p.x + h[1]! * p.y + h[2]!) / w, y: (h[3]! * p.x + h[4]! * p.y + h[5]!) / w }
}
/** A line in the form a·x + b·y = c with (a, b) of unit length. */
export type Line = {
  a: number;
  b: number;
  c: number;
}
export const lineThrough = (p: Point, q: Point): Line => {
  const a = q.y - p.y

  const b = p.x - q.x

  const length = Math.hypot(a, b) || 1

  return { a: a / length, b: b / length, c: (a * p.x + b * p.y) / length }
}
export const intersectLines = (l1: Line, l2: Line): Point | undefined => {
  const det = l1.a * l2.b - l2.a * l1.b

  if (Math.abs(det) < 1e-9)
    return undefined

  return { x: (l1.c * l2.b - l2.c * l1.b) / det, y: (l1.a * l2.c - l2.a * l1.c) / det }
}
