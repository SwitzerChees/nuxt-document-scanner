export type FrameSize = {
  width: number
  height: number
}

export type DocumentQuadValidationOptions = {
  frameSize?: FrameSize
  minAreaRatio?: number
  minAreaPixels?: number
  minSideRatio?: number
  minSidePixels?: number
  maxAspectRatio?: number
  minOppositeSideRatio?: number
  minCornerSine?: number
  boundsTolerance?: number
}

export type DocumentQuadValidation = {
  valid: boolean
  reasons: string[]
  area: number
  areaRatio: number
  aspectRatio: number
  minCornerSine: number
}

export type QuadMotion = {
  rms: number
  max: number
  areaChange: number
  iou: number
}

type Point = { x: number; y: number }

const toPoints = (quad: readonly number[]): Point[] =>
  quad.length === 8
    ? Array.from({ length: 4 }, (_, index) => ({
        x: quad[index * 2]!,
        y: quad[index * 2 + 1]!,
      }))
    : []

const signedArea = (points: Point[]) =>
  points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]!
    return sum + point.x * next.y - next.x * point.y
  }, 0) / 2

export const calculateQuadArea = (quad: readonly number[]) =>
  Math.abs(signedArea(toPoints(quad)))

const sideLengths = (points: Point[]) =>
  points.map((point, index) => {
    const next = points[(index + 1) % points.length]!
    return Math.hypot(next.x - point.x, next.y - point.y)
  })

const cornerSines = (points: Point[]) =>
  points.map((point, index) => {
    const previous = points[(index + points.length - 1) % points.length]!
    const next = points[(index + 1) % points.length]!
    const ax = previous.x - point.x
    const ay = previous.y - point.y
    const bx = next.x - point.x
    const by = next.y - point.y
    const denominator = Math.hypot(ax, ay) * Math.hypot(bx, by)
    return denominator ? Math.abs(ax * by - ay * bx) / denominator : 0
  })

const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)

const isConvex = (points: Point[]) => {
  const products = points.map((point, index) =>
    cross(point, points[(index + 1) % 4]!, points[(index + 2) % 4]!),
  )
  const epsilon = 1e-5
  return products.every((value) => value > epsilon) || products.every((value) => value < -epsilon)
}

export const validateDocumentQuad = (
  quad: readonly number[] | undefined,
  options: DocumentQuadValidationOptions = {},
): DocumentQuadValidation => {
  const reasons: string[] = []
  const empty = {
    valid: false,
    reasons,
    area: 0,
    areaRatio: 0,
    aspectRatio: Number.POSITIVE_INFINITY,
    minCornerSine: 0,
  }
  if (!quad || quad.length !== 8) {
    reasons.push('point-count')
    return empty
  }
  if (quad.some((value) => !Number.isFinite(value))) {
    reasons.push('non-finite')
    return empty
  }

  const points = toPoints(quad)
  const frame = options.frameSize
  const frameArea = frame ? frame.width * frame.height : 0
  const frameDiagonal = frame ? Math.hypot(frame.width, frame.height) : 0
  const area = calculateQuadArea(quad)
  const areaRatio = frameArea > 0 ? area / frameArea : 0
  const lengths = sideLengths(points)
  const horizontal = (lengths[0]! + lengths[2]!) / 2
  const vertical = (lengths[1]! + lengths[3]!) / 2
  const aspectRatio = Math.max(horizontal, vertical) / Math.max(1e-6, Math.min(horizontal, vertical))
  const sines = cornerSines(points)
  const minCornerSine = Math.min(...sines)

  if (!isConvex(points)) reasons.push('non-convex')

  const minAreaPixels = options.minAreaPixels ?? 256
  if (area < minAreaPixels) reasons.push('area-pixels')
  if (frameArea > 0 && areaRatio < (options.minAreaRatio ?? 0.02)) {
    reasons.push('area-ratio')
  }

  const minSidePixels = options.minSidePixels ?? 8
  const minSide = Math.min(...lengths)
  if (minSide < minSidePixels) reasons.push('side-pixels')
  if (frameDiagonal > 0 && minSide / frameDiagonal < (options.minSideRatio ?? 0.025)) {
    reasons.push('side-ratio')
  }

  if (aspectRatio > (options.maxAspectRatio ?? 12)) reasons.push('aspect-ratio')
  const oppositeRatios = [
    Math.min(lengths[0]!, lengths[2]!) / Math.max(lengths[0]!, lengths[2]!),
    Math.min(lengths[1]!, lengths[3]!) / Math.max(lengths[1]!, lengths[3]!),
  ]
  if (Math.min(...oppositeRatios) < (options.minOppositeSideRatio ?? 0.12)) {
    reasons.push('perspective-degenerate')
  }
  if (minCornerSine < (options.minCornerSine ?? 0.12)) {
    reasons.push('corner-degenerate')
  }

  if (frame) {
    const tolerance = options.boundsTolerance ?? 0.04
    const minX = -frame.width * tolerance
    const maxX = frame.width * (1 + tolerance)
    const minY = -frame.height * tolerance
    const maxY = frame.height * (1 + tolerance)
    if (points.some((point) => point.x < minX || point.x > maxX || point.y < minY || point.y > maxY)) {
      reasons.push('out-of-bounds')
    }
  }

  return {
    valid: reasons.length === 0,
    reasons,
    area,
    areaRatio,
    aspectRatio,
    minCornerSine,
  }
}

const polygonIntersection = (subject: Point[], clip: Point[]) => {
  let output = subject.slice()
  const orientation = signedArea(clip) >= 0 ? 1 : -1

  const lineIntersection = (a: Point, b: Point, c: Point, d: Point): Point => {
    const denominator = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x)
    if (Math.abs(denominator) < 1e-9) return b
    const determinantA = a.x * b.y - a.y * b.x
    const determinantB = c.x * d.y - c.y * d.x
    return {
      x: (determinantA * (c.x - d.x) - (a.x - b.x) * determinantB) / denominator,
      y: (determinantA * (c.y - d.y) - (a.y - b.y) * determinantB) / denominator,
    }
  }

  for (let index = 0; index < clip.length; index++) {
    const edgeStart = clip[index]!
    const edgeEnd = clip[(index + 1) % clip.length]!
    const input = output
    output = []
    if (!input.length) break
    let previous = input[input.length - 1]!
    for (const current of input) {
      const currentInside =
        ((edgeEnd.x - edgeStart.x) * (current.y - edgeStart.y) -
          (edgeEnd.y - edgeStart.y) * (current.x - edgeStart.x)) * orientation >= -1e-7
      const previousInside =
        ((edgeEnd.x - edgeStart.x) * (previous.y - edgeStart.y) -
          (edgeEnd.y - edgeStart.y) * (previous.x - edgeStart.x)) * orientation >= -1e-7
      if (currentInside) {
        if (!previousInside) output.push(lineIntersection(previous, current, edgeStart, edgeEnd))
        output.push(current)
      } else if (previousInside) {
        output.push(lineIntersection(previous, current, edgeStart, edgeEnd))
      }
      previous = current
    }
  }
  return output
}

export const quadIntersectionOverUnion = (first: readonly number[], second: readonly number[]) => {
  const firstPoints = toPoints(first)
  const secondPoints = toPoints(second)
  if (firstPoints.length !== 4 || secondPoints.length !== 4) return 0
  const firstArea = Math.abs(signedArea(firstPoints))
  const secondArea = Math.abs(signedArea(secondPoints))
  if (!firstArea || !secondArea) return 0
  const intersectionArea = Math.abs(signedArea(polygonIntersection(firstPoints, secondPoints)))
  const union = firstArea + secondArea - intersectionArea
  return union > 0 ? intersectionArea / union : 0
}

export const calculateQuadMotion = (
  previous: readonly number[],
  next: readonly number[],
  frameSize: FrameSize,
): QuadMotion => {
  const diagonal = Math.max(1, Math.hypot(frameSize.width, frameSize.height))
  const distances: number[] = []
  for (let index = 0; index < 8; index += 2) {
    distances.push(
      Math.hypot(next[index]! - previous[index]!, next[index + 1]! - previous[index + 1]!) /
        diagonal,
    )
  }
  const previousArea = calculateQuadArea(previous)
  const nextArea = calculateQuadArea(next)
  return {
    rms: Math.sqrt(distances.reduce((sum, value) => sum + value ** 2, 0) / 4),
    max: Math.max(...distances),
    areaChange:
      previousArea && nextArea
        ? Math.abs(nextArea - previousArea) / Math.max(previousArea, nextArea)
        : 1,
    iou: quadIntersectionOverUnion(previous, next),
  }
}

export const emaQuad = (
  previous: readonly number[] | undefined,
  next: readonly number[] | undefined,
  alpha = 0.45,
) => {
  if (!previous) return next ? Array.from(next) : undefined
  if (!next) return Array.from(previous)
  return Array.from({ length: 8 }, (_, index) =>
    previous[index]! + alpha * (next[index]! - previous[index]!),
  )
}
