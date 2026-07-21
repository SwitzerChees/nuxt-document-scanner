export type QuadEvaluation = {
  cornerNme: number
  polygonIou: number
}

type Point = { x: number; y: number }

const toPoints = (quad: readonly number[]): Point[] => {
  if (quad.length !== 8) return []
  return Array.from({ length: 4 }, (_, index) => ({
    x: quad[index * 2]!,
    y: quad[index * 2 + 1]!,
  }))
}

const signedArea = (points: Point[]) =>
  points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length]!
    return area + point.x * next.y - next.x * point.y
  }, 0) / 2

const area = (points: Point[]) => Math.abs(signedArea(points))

const cross = (a: Point, b: Point, point: Point) =>
  (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)

const lineIntersection = (a: Point, b: Point, c: Point, d: Point): Point => {
  const denominator =
    (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x)
  if (Math.abs(denominator) < 1e-9) return b
  const determinantA = a.x * b.y - a.y * b.x
  const determinantB = c.x * d.y - c.y * d.x
  return {
    x:
      (determinantA * (c.x - d.x) - (a.x - b.x) * determinantB) /
      denominator,
    y:
      (determinantA * (c.y - d.y) - (a.y - b.y) * determinantB) /
      denominator,
  }
}

const intersectConvexPolygons = (subject: Point[], clip: Point[]) => {
  let output = subject.slice()
  const orientation = signedArea(clip) >= 0 ? 1 : -1

  for (let edge = 0; edge < clip.length; edge++) {
    const clipStart = clip[edge]!
    const clipEnd = clip[(edge + 1) % clip.length]!
    const input = output
    output = []
    if (!input.length) break
    let previous = input[input.length - 1]!

    for (const current of input) {
      const currentInside = cross(clipStart, clipEnd, current) * orientation >= -1e-7
      const previousInside = cross(clipStart, clipEnd, previous) * orientation >= -1e-7
      if (currentInside) {
        if (!previousInside) {
          output.push(lineIntersection(previous, current, clipStart, clipEnd))
        }
        output.push(current)
      } else if (previousInside) {
        output.push(lineIntersection(previous, current, clipStart, clipEnd))
      }
      previous = current
    }
  }

  return output
}

export const cornerNormalizedMeanError = (
  actual: readonly number[],
  expected: readonly number[],
  imageWidth: number,
  imageHeight: number,
) => {
  if (actual.length !== 8 || expected.length !== 8) return Number.POSITIVE_INFINITY
  const diagonal = Math.hypot(imageWidth, imageHeight)
  if (!diagonal) return Number.POSITIVE_INFINITY
  let distance = 0
  for (let index = 0; index < 8; index += 2) {
    distance += Math.hypot(
      actual[index]! - expected[index]!,
      actual[index + 1]! - expected[index + 1]!,
    )
  }
  return distance / 4 / diagonal
}

export const polygonIntersectionOverUnion = (
  actual: readonly number[],
  expected: readonly number[],
) => {
  const actualPoints = toPoints(actual)
  const expectedPoints = toPoints(expected)
  if (actualPoints.length !== 4 || expectedPoints.length !== 4) return 0
  const actualArea = area(actualPoints)
  const expectedArea = area(expectedPoints)
  if (!actualArea || !expectedArea) return 0
  const intersectionArea = area(intersectConvexPolygons(actualPoints, expectedPoints))
  const union = actualArea + expectedArea - intersectionArea
  return union > 0 ? intersectionArea / union : 0
}

export const evaluateQuad = (
  actual: readonly number[],
  expected: readonly number[],
  imageWidth: number,
  imageHeight: number,
): QuadEvaluation => ({
  cornerNme: cornerNormalizedMeanError(actual, expected, imageWidth, imageHeight),
  polygonIou: polygonIntersectionOverUnion(actual, expected),
})
