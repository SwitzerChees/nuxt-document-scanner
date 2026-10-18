import { distance, intersectLines, isConvex, lineThrough, quadCenter } from './geometry'
import type { Line, Point, Quad } from './geometry'
import { sampleLuma } from './image'
import type { RgbaImage } from './image'

export type RefineOptions = {
  /** Distance (px) searched on both sides of each coarse edge. Defaults to ~1.2% of the image diagonal. */
  searchRadius?: number;
  samplesPerEdge?: number;
  /** Share of edge samples that must agree on one straight line for the edge to count as found. */
  minInlierRatio?: number;
  /** Weakest luminance step (per 2px) accepted as a page border. */
  minGradient?: number;
}
export type RefineResult = {
  quad: Quad;
  /** Number of edges (0–4) that were located in the image; the others kept the model's estimate. */
  refinedEdges: number;
}
type EdgeFrame = {
  origin: Point;
  tangent: Point;
  normal: Point;
  length: number;
}
type EdgeSample = {
  s: number;
  offset: number;
  weight: number;
}
type Profile = {
  gradients: Float32Array;
  radius: number;
}
const edgeFrame = (from: Point, to: Point, center: Point): EdgeFrame => {
  const length = distance(from, to)

  const tangent = { x: (to.x - from.x) / length, y: (to.y - from.y) / length }

  let normal = { x: -tangent.y, y: tangent.x }

  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }

  if ((mid.x - center.x) * normal.x + (mid.y - center.y) * normal.y < 0)
    normal = { x: -normal.x, y: -normal.y }

  return { origin: from, tangent, normal, length }
}
/** Outward luminance derivative across the edge, averaged over a short strip along it to suppress noise and text. */
const gradientProfile = (image: RgbaImage, base: Point, frame: EdgeFrame, radius: number): Profile => {
  const values = new Float32Array(2 * radius + 3)

  for (let i = 0; i < values.length; i++) {
    const d = i - radius - 1

    let sum = 0

    for (const along of [-1.5, 0, 1.5]) {
      sum += sampleLuma(image, base.x + frame.normal.x * d + frame.tangent.x * along, base.y + frame.normal.y * d + frame.tangent.y * along)
    }

    values[i] = sum / 3
  }

  const gradients = new Float32Array(2 * radius + 1)

  for (let i = 0; i < gradients.length; i++)
    gradients[i] = values[i + 2]! - values[i]!

  return { gradients, radius }
}
/** Strongest step of the given polarity, favouring steps near the coarse edge; sub-pixel via a parabola fit. */
const strongestStep = (profile: Profile, polarity: number, minGradient: number) => {
  const { gradients, radius } = profile

  const sigma = radius * 0.6

  let best = -1

  let bestScore = 0

  for (let i = 0; i < gradients.length; i++) {
    const value = gradients[i]! * polarity

    if (value < minGradient)
      continue

    const d = i - radius

    const score = value * Math.exp(-(d * d) / (2 * sigma * sigma))

    if (score > bestScore) {
      bestScore = score

      best = i
    }
  }

  if (best < 0)
    return undefined

  const left = (gradients[best - 1] ?? 0) * polarity

  const center = gradients[best]! * polarity

  const right = (gradients[best + 1] ?? 0) * polarity

  const curvature = left - 2 * center + right

  const shift = curvature < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (left - right)) / curvature)) : 0

  return { offset: best - radius + shift, weight: center }
}
/** Fits offset = a + b·s robustly: best consensus over sample pairs, then weighted least squares on its inliers. */
const fitOffsetLine = (samples: EdgeSample[], tolerance: number) => {
  const inliersOf = (a: number, b: number) => samples.filter((p) => Math.abs(p.offset - (a + b * p.s)) <= tolerance)

  let best: EdgeSample[] = []

  const step = Math.max(1, Math.floor(samples.length / 3))

  for (let i = 0; i < samples.length; i++) {
    for (const j of [i + step, i + 2 * step]) {
      const p = samples[i]!

      const q = samples[j]

      if (!q || q.s === p.s)
        continue

      const b = (q.offset - p.offset) / (q.s - p.s)

      const inliers = inliersOf(p.offset - b * p.s, b)

      if (inliers.length > best.length)
        best = inliers
    }
  }

  if (best.length < 2)
    return { inliers: best }

  let sw = 0

  let ss = 0

  let so = 0

  let sss = 0

  let sso = 0

  for (const p of best) {
    sw += p.weight

    ss += p.weight * p.s

    so += p.weight * p.offset

    sss += p.weight * p.s * p.s

    sso += p.weight * p.s * p.offset
  }

  const det = sw * sss - ss * ss

  if (Math.abs(det) < 1e-9)
    return { inliers: best }

  const b = (sw * sso - ss * so) / det

  const a = (so - b * ss) / sw

  return { inliers: inliersOf(a, b), a, b }
}
const refineEdge = (image: RgbaImage, frame: EdgeFrame, options: Required<RefineOptions>): Line | undefined => {
  const { searchRadius: radius, samplesPerEdge, minGradient, minInlierRatio } = options

  if (frame.length < radius * 3)
    return undefined

  const profiles: {
    s: number;
    profile: Profile;
  }[] = []

  for (let k = 0; k < samplesPerEdge; k++) {
    // Stay clear of the corners, where the neighbouring edge would answer instead.

    const s = (0.1 + (0.8 * (k + 0.5)) / samplesPerEdge) * frame.length

    const base = { x: frame.origin.x + frame.tangent.x * s, y: frame.origin.y + frame.tangent.y * s }

    const reach = { x: frame.normal.x * (radius + 2), y: frame.normal.y * (radius + 2) }

    const inside = (p: Point) => p.x >= 0 && p.y >= 0 && p.x <= image.width && p.y <= image.height

    if (!inside({ x: base.x + reach.x, y: base.y + reach.y }) || !inside({ x: base.x - reach.x, y: base.y - reach.y }))
      continue

    profiles.push({ s, profile: gradientProfile(image, base, frame, radius) })
  }

  if (profiles.length < samplesPerEdge * minInlierRatio)
    return undefined

  // A page is usually brighter than its surroundings, but not always: take the polarity the edge agrees on.

  let polarityVotes = 0

  for (const { profile } of profiles) {
    const dark = strongestStep(profile, -1, minGradient)?.weight ?? 0

    const bright = strongestStep(profile, 1, minGradient)?.weight ?? 0

    polarityVotes += dark - bright
  }

  const polarity = polarityVotes >= 0 ? -1 : 1

  const samples: EdgeSample[] = []

  for (const { s, profile } of profiles) {
    const step = strongestStep(profile, polarity, minGradient)

    if (step)
      samples.push({ s: s / frame.length, offset: step.offset, weight: step.weight })
  }

  const fit = fitOffsetLine(samples, 1.5)

  if (fit.a === undefined || fit.b === undefined || fit.inliers.length < samplesPerEdge * minInlierRatio)
    return undefined

  const at = (s: number) => {
    const offset = fit.a! + fit.b! * s

    return {
      x: frame.origin.x + frame.tangent.x * s * frame.length + frame.normal.x * offset,
      y: frame.origin.y + frame.tangent.y * s * frame.length + frame.normal.y * offset,
    }
  }

  return lineThrough(at(0), at(1))
}
/**
 * Snaps the model's corners (accurate to a few pixels at best) onto the actual page borders in the full-resolution
 * capture: each edge is located along its normal, fitted as a straight line and intersected with its neighbours.
 * Edges that cannot be found keep the coarse estimate, and implausible results fall back to it entirely.
 */
export const refineQuad = (image: RgbaImage, quad: Quad, options: RefineOptions = {}): RefineResult => {
  const diagonal = Math.hypot(image.width, image.height)

  const resolved: Required<RefineOptions> = {
    searchRadius: options.searchRadius ?? Math.round(Math.min(48, Math.max(8, diagonal * 0.012))),
    samplesPerEdge: options.samplesPerEdge ?? 48,
    minInlierRatio: options.minInlierRatio ?? 0.35,
    minGradient: options.minGradient ?? 6,
  }

  const center = quadCenter(quad)

  let refinedEdges = 0

  const lines = quad.map((from, i) => {
    const to = quad[(i + 1) % 4]!

    const refined = refineEdge(image, edgeFrame(from, to, center), resolved)

    if (refined)
      refinedEdges++

    return refined ?? lineThrough(from, to)
  })

  if (!refinedEdges)
    return { quad, refinedEdges }

  const maxShift = resolved.searchRadius * 2

  const corners = quad.map((coarse, i) => {
    const corner = intersectLines(lines[(i + 3) % 4]!, lines[i]!)

    return corner && distance(corner, coarse) <= maxShift ? corner : coarse
  }) as Quad

  if (!isConvex(corners))
    return { quad, refinedEdges: 0 }

  return { quad: corners, refinedEdges }
}
