import { enhanceDocument } from './enhance'
import type { FilterMode } from './enhance'
import { rectifiedSize } from './geometry'
import type { Quad } from './geometry'
import { rotateImage } from './image'
import type { RgbaImage, Rotation } from './image'
import { refineQuad } from './refine'
import { sharpnessScore } from './sharpness'
import { warpPerspective } from './warp'
/** A4 at 300 dpi; more resolution than this only adds bytes. */
export const MAX_PAGE_LONG_EDGE = 3508
export type PageSettings = {
  mode: FilterMode;
  rotation: Rotation;
}
export type CaptureInput = PageSettings & {
  /** Consecutive frames of the same scene; the sharpest one is used. */
  frames: RgbaImage[];
  /** Page corners in frame pixels. */
  quad: Quad;
  /** Snap the corners to the page borders first (off for corners the user placed by hand). */
  refine: boolean;
  maxLongEdge?: number;
}
export type CaptureOutput = {
  page: RgbaImage;
  frame: RgbaImage;
  quad: Quad;
  refinedEdges: number;
  timings: Record<'select' | 'refine' | 'warp' | 'enhance', number>;
}
/** Index of the frame with the least motion or focus blur inside the page area. */
export const selectSharpestFrame = (frames: RgbaImage[], quad: Quad) => {
  if (frames.length < 2)
    return 0

  const xs = quad.map((p) => p.x)

  const ys = quad.map((p) => p.y)

  const region = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }

  // ~40k samples per frame are plenty to rank frames of the same scene.

  const step = Math.max(2, Math.round(Math.sqrt((region.width * region.height) / 40000)))

  let best = 0

  let bestScore = -1

  frames.forEach((frame, index) => {
    const score = sharpnessScore(frame, region, step)

    if (score > bestScore) {
      bestScore = score

      best = index
    }
  })

  return best
}
export const processCapture = (input: CaptureInput): CaptureOutput => {
  let mark = performance.now()

  const lap = () => {
    const now = performance.now()

    const elapsed = now - mark

    mark = now

    return Math.round(elapsed)
  }

  const frame = input.frames[selectSharpestFrame(input.frames, input.quad)]!

  const select = lap()

  const refined = input.refine ? refineQuad(frame, input.quad) : { quad: input.quad, refinedEdges: 0 }

  const refine = lap()

  const warped = warpPerspective(frame, refined.quad, rectifiedSize(refined.quad, input.maxLongEdge ?? MAX_PAGE_LONG_EDGE))

  const warp = lap()

  const page = rotateImage(enhanceDocument(warped, input.mode), input.rotation)

  const enhance = lap()

  return { page, frame, quad: refined.quad, refinedEdges: refined.refinedEdges, timings: { select, refine, warp, enhance } }
}
