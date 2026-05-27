import { calculateQuadArea, isValidRectangle } from './overlay'

type FrameSize = {
  width: number
  height: number
}

export const scaleCornersBetweenSizes = (
  corners: number[],
  source: FrameSize,
  target: FrameSize,
) => {
  const scaleX = target.width / source.width
  const scaleY = target.height / source.height
  return corners.map((value, index) =>
    index % 2 === 0 ? value * scaleX : value * scaleY,
  )
}

const getQuadCenter = (corners: number[]) => {
  return {
    x: (corners[0]! + corners[2]! + corners[4]! + corners[6]!) / 4,
    y: (corners[1]! + corners[3]! + corners[5]! + corners[7]!) / 4,
  }
}

const getAverageCornerDistance = (a: number[], b: number[]) => {
  let distance = 0
  for (let i = 0; i < 8; i += 2) {
    distance += Math.hypot(a[i]! - b[i]!, a[i + 1]! - b[i + 1]!)
  }
  return distance / 4
}

export const isPlausibleCornerRefinement = (
  referenceCorners: number[],
  detectedCorners: number[],
  frameSize: FrameSize,
) => {
  const referenceArea = calculateQuadArea(referenceCorners)
  const detectedArea = calculateQuadArea(detectedCorners)
  if (!referenceArea || !detectedArea) return false

  const frameDiagonal = Math.hypot(frameSize.width, frameSize.height)
  const referenceCenter = getQuadCenter(referenceCorners)
  const detectedCenter = getQuadCenter(detectedCorners)
  const centerDistance =
    Math.hypot(
      referenceCenter.x - detectedCenter.x,
      referenceCenter.y - detectedCenter.y,
    ) / frameDiagonal
  const cornerDistance =
    getAverageCornerDistance(referenceCorners, detectedCorners) / frameDiagonal
  const areaSimilarity =
    Math.min(referenceArea, detectedArea) /
    Math.max(referenceArea, detectedArea)

  return (
    areaSimilarity >= 0.45 &&
    centerDistance <= 0.18 &&
    cornerDistance <= 0.22
  )
}

export const selectCaptureCorners = (input: {
  detectedCorners?: number[]
  liveCorners?: number[]
  liveFrameSize?: FrameSize
  finalFrameSize: FrameSize
  isHighResolution?: boolean
}) => {
  const liveCorners =
    input.liveCorners && input.isHighResolution && input.liveFrameSize
      ? scaleCornersBetweenSizes(
          input.liveCorners,
          input.liveFrameSize,
          input.finalFrameSize,
        )
      : input.liveCorners
  const preferredCorners = input.isHighResolution
    ? liveCorners
    : input.detectedCorners
  const fallbackCorners = input.isHighResolution
    ? input.detectedCorners
    : liveCorners
  const validDetectedCorners =
    input.detectedCorners && isValidRectangle(input.detectedCorners)
      ? input.detectedCorners
      : undefined
  const validLiveCorners =
    liveCorners && isValidRectangle(liveCorners) ? liveCorners : undefined

  if (input.isHighResolution) {
    if (
      validDetectedCorners &&
      (!validLiveCorners ||
        isPlausibleCornerRefinement(
          validLiveCorners,
          validDetectedCorners,
          input.finalFrameSize,
        ))
    ) {
      return validDetectedCorners
    }
    if (validLiveCorners) return validLiveCorners
    if (validDetectedCorners) return validDetectedCorners
  }

  if (preferredCorners && isValidRectangle(preferredCorners)) {
    return preferredCorners
  }
  if (fallbackCorners && isValidRectangle(fallbackCorners)) {
    return fallbackCorners
  }
}
