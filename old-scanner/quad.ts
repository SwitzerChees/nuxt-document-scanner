// Requires OpenCV.js loaded (cv global). Keep pure helpers.
export const toMat = (img: ImageData) => {
  // @ts-ignore - cv provided globally by /public/opencv/opencv.js
  const mat = cv.matFromImageData(img)
  return mat
}

let detectionParams = {
  binaryThreshold: 30,
  minAreaPercent: 0.03,
}

export const setDetectionParams = (params: Partial<typeof detectionParams>) => {
  detectionParams = { ...detectionParams, ...params }
}

// Hough Lines based detection - finds straight edges and their intersections
const detectWithHoughLines = (gray: any): number[] | undefined => {
  try {
    // @ts-ignore
    const lines = new cv.Mat()
    // @ts-ignore
    cv.HoughLinesP(gray, lines, 1, Math.PI / 180, 50, 50, 10)

    if (lines.rows < 4) {
      lines.delete()
      return undefined
    }

    // Group lines by angle (horizontal vs vertical)
    const horizontalLines: { x1: number; y1: number; x2: number; y2: number; angle: number }[] = []
    const verticalLines: { x1: number; y1: number; x2: number; y2: number; angle: number }[] = []

    for (let i = 0; i < lines.rows; i++) {
      const x1 = lines.data32S[i * 4]
      const y1 = lines.data32S[i * 4 + 1]
      const x2 = lines.data32S[i * 4 + 2]
      const y2 = lines.data32S[i * 4 + 3]

      const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI)
      const absAngle = Math.abs(angle)

      if (absAngle < 20 || absAngle > 160) {
        // Horizontal-ish
        horizontalLines.push({ x1, y1, x2, y2, angle })
      } else if (absAngle > 70 && absAngle < 110) {
        // Vertical-ish
        verticalLines.push({ x1, y1, x2, y2, angle })
      }
    }

    lines.delete()

    if (horizontalLines.length < 2 || verticalLines.length < 2) {
      return undefined
    }

    // Find the top, bottom, left, right lines
    horizontalLines.sort((a, b) => (a.y1 + a.y2) / 2 - (b.y1 + b.y2) / 2)
    verticalLines.sort((a, b) => (a.x1 + a.x2) / 2 - (b.x1 + b.x2) / 2)

    const topLine = horizontalLines[0]
    const bottomLine = horizontalLines[horizontalLines.length - 1]
    const leftLine = verticalLines[0]
    const rightLine = verticalLines[verticalLines.length - 1]

    if (!topLine || !bottomLine || !leftLine || !rightLine) return undefined

    // Find intersections
    const topLeft = lineIntersection(topLine, leftLine)
    const topRight = lineIntersection(topLine, rightLine)
    const bottomRight = lineIntersection(bottomLine, rightLine)
    const bottomLeft = lineIntersection(bottomLine, leftLine)

    if (!topLeft || !topRight || !bottomRight || !bottomLeft) {
      return undefined
    }

    return [topLeft.x, topLeft.y, topRight.x, topRight.y, bottomRight.x, bottomRight.y, bottomLeft.x, bottomLeft.y]
  } catch (e) {
    return undefined
  }
}

// Calculate intersection of two lines
const lineIntersection = (
  line1: { x1: number; y1: number; x2: number; y2: number },
  line2: { x1: number; y1: number; x2: number; y2: number }
): { x: number; y: number } | undefined => {
  const x1 = line1.x1,
    y1 = line1.y1,
    x2 = line1.x2,
    y2 = line1.y2
  const x3 = line2.x1,
    y3 = line2.y1,
    x4 = line2.x2,
    y4 = line2.y2

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (Math.abs(denom) < 0.01) return undefined

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
  const x = x1 + t * (x2 - x1)
  const y = y1 + t * (y2 - y1)

  return { x, y }
}

export const biggestQuad = (
  edge: ImageData
): { quad: number[] | undefined; stats: { contoursFound: number; quadsFound: number; bestScore: number } } => {
  const stats = { contoursFound: 0, quadsFound: 0, bestScore: 0 }
  if (!('cv' in globalThis)) return { quad: undefined, stats }
  // @ts-ignore
  const src = cv.matFromImageData(edge)
  // @ts-ignore
  const gray = new cv.Mat()
  // @ts-ignore
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

  // Method 1: Try Hough Line detection for precise document edges
  const houghQuad = detectWithHoughLines(gray)
  if (houghQuad) {
    stats.bestScore = 1.0
    stats.quadsFound = 1
    // @ts-ignore
    src.delete()
    gray.delete()
    return { quad: houghQuad, stats }
  }

  // Method 2: Fallback to improved contour detection
  // @ts-ignore
  const blur = new cv.Mat()
  // @ts-ignore
  cv.medianBlur(gray, blur, 3) // Faster than Gaussian
  // @ts-ignore
  const bin = new cv.Mat()
  // @ts-ignore
  cv.threshold(blur, bin, detectionParams.binaryThreshold, 255, cv.THRESH_BINARY)
  // @ts-ignore
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))
  // @ts-ignore
  const closed = new cv.Mat()
  // @ts-ignore
  cv.morphologyEx(bin, closed, cv.MORPH_CLOSE, kernel)
  // @ts-ignore
  const contours = new cv.MatVector()
  // @ts-ignore
  const hierarchy = new cv.Mat()
  // @ts-ignore
  cv.findContours(closed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

  stats.contoursFound = contours.size()

  const frameArea = gray.cols * gray.rows
  const minArea = detectionParams.minAreaPercent * frameArea
  const maxArea = 0.95 * frameArea // Not too close to frame edges

  let best: number[] | undefined
  let bestScore = 0

  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i)
    // @ts-ignore
    const peri = cv.arcLength(c, true)
    // @ts-ignore
    const approx = new cv.Mat()
    // @ts-ignore
    cv.approxPolyDP(c, approx, 0.04 * peri, true)
    // @ts-ignore
    const contourArea = cv.contourArea(approx)

    // Only consider 4-sided shapes within size constraints
    // @ts-ignore
    if (approx.rows === 4 && contourArea > minArea && contourArea < maxArea) {
      const pts: number[] = []
      for (let j = 0; j < 4; j++) {
        // @ts-ignore
        pts.push(approx.intPtr(j, 0)[0], approx.intPtr(j, 0)[1])
      }

      // Calculate aspect ratio to prefer document shapes
      const [x0, y0, x1, y1, x2, y2, x3, y3] = pts
      const width1 = Math.hypot(x1 - x0, y1 - y0)
      const width2 = Math.hypot(x2 - x3, y2 - y3)
      const height1 = Math.hypot(x3 - x0, y3 - y0)
      const height2 = Math.hypot(x2 - x1, y2 - y1)
      const avgWidth = (width1 + width2) / 2
      const avgHeight = (height1 + height2) / 2
      const aspectRatio = Math.max(avgWidth, avgHeight) / Math.min(avgWidth, avgHeight)

      // Prefer aspect ratios close to A4 (1.414) or US Letter (1.294)
      // Ideal range: 1.2 to 1.8 for portrait/landscape documents
      const aspectScore = aspectRatio > 1.1 && aspectRatio < 1.8 ? 1.5 : 0.3

      // Check if quad is roughly rectangular (opposite sides similar length)
      const widthDiff = Math.abs(width1 - width2) / Math.max(width1, width2)
      const heightDiff = Math.abs(height1 - height2) / Math.max(height1, height2)
      const rectangularScore = widthDiff < 0.15 && heightDiff < 0.15 ? 2.0 : 0.5

      // Calculate center bias - prefer quads closer to center
      const centerX = gray.cols / 2
      const centerY = gray.rows / 2
      const quadCenterX = (x0 + x1 + x2 + x3) / 4
      const quadCenterY = (y0 + y1 + y2 + y3) / 4
      const distFromCenter = Math.hypot(quadCenterX - centerX, quadCenterY - centerY)
      const maxDist = Math.hypot(centerX, centerY)
      const centerScore = 1.0 + (1.0 - distFromCenter / maxDist) * 1.5 // 1.0 to 2.5 range

      // Penalize quads that are too close to frame edges (likely the frame itself)
      const edgeMargin = 20
      const tooCloseToEdge =
        Math.min(x0, x1, x2, x3) < edgeMargin ||
        Math.max(x0, x1, x2, x3) > gray.cols - edgeMargin ||
        Math.min(y0, y1, y2, y3) < edgeMargin ||
        Math.max(y0, y1, y2, y3) > gray.rows - edgeMargin
      const edgeScore = tooCloseToEdge ? 0.1 : 1.0

      // Combine area and shape quality into a score
      const areaScore = contourArea / frameArea
      const score = areaScore * aspectScore * rectangularScore * centerScore * edgeScore

      if (score > bestScore) {
        best = pts
        bestScore = score
      }
      if (approx.rows === 4) {
        stats.quadsFound++
      }
    }
    approx.delete()
    c.delete()
  }

  stats.bestScore = bestScore

  contours.delete()
  hierarchy.delete()
  src.delete()
  gray.delete()
  blur.delete()
  bin.delete()
  kernel.delete()
  closed.delete()
  return { quad: best, stats }
}

export const orderQuad = (pts: number[] | undefined) => {
  if (!pts || pts.length !== 8) return undefined
  const p = [
    { x: pts[0], y: pts[1] },
    { x: pts[2], y: pts[3] },
    { x: pts[4], y: pts[5] },
    { x: pts[6], y: pts[7] },
  ]
  const cx = p.reduce((a, b) => a + (b?.x || 0), 0) / 4
  const cy = p.reduce((a, b) => a + (b?.y || 0), 0) / 4
  const byAngle = p.slice().sort((a, b) => Math.atan2((a?.y || 0) - cy, (a?.x || 0) - cx) - Math.atan2((b?.y || 0) - cy, (b?.x || 0) - cx))
  return byAngle.flatMap((pt) => [pt?.x || 0, pt?.y || 0])
}

const area = (q: number[]) =>
  Math.abs(q[0] * q[3] - q[2] * q[1] + (q[2] * q[5] - q[4] * q[3]) + (q[4] * q[7] - q[6] * q[5]) + (q[6] * q[1] - q[0] * q[7]))

export const emaQuad = (prev: number[] | undefined, next: number[] | undefined, alpha = 0.25) => {
  if (!prev) return next
  if (!next) return prev
  const out: number[] = []
  for (let i = 0; i < 8; i++) out[i] = prev[i] + alpha * (next[i] - prev[i])
  return out
}

export const warpPerspective = (rgba: ImageData, quad: number[], outW = 1000) => {
  if (!('cv' in globalThis) || !quad) return undefined
  // @ts-ignore
  const src = cv.matFromImageData(rgba)
  const ordered = orderQuad(quad)
  if (!ordered) {
    src.delete()
    return undefined
  }
  const [x0, y0, x1, y1, x2, y2, x3, y3] = ordered
  const wA = Math.hypot(x1 - x0, y1 - y0)
  const wB = Math.hypot(x2 - x3, y2 - y3)
  const hA = Math.hypot(x3 - x0, y3 - y0)
  const hB = Math.hypot(x2 - x1, y2 - y1)
  const outH = Math.round(Math.max(hA, hB) * (outW / Math.max(wA, wB)))
  // @ts-ignore
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, new Float32Array([x0, y0, x1, y1, x2, y2, x3, y3]))
  // @ts-ignore
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, new Float32Array([0, 0, outW, 0, outW, outH, 0, outH]))
  // @ts-ignore
  const M = cv.getPerspectiveTransform(srcTri, dstTri)
  // @ts-ignore
  const dst = new cv.Mat()
  // @ts-ignore
  cv.warpPerspective(src, dst, M, new cv.Size(outW, outH))
  const out = new ImageData(new Uint8ClampedArray(dst.data), outW, outH)
  src.delete()
  srcTri.delete()
  dstTri.delete()
  M.delete()
  dst.delete()
  return out
}
