import { isValidRectangle } from './overlay'

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

  if (preferredCorners && isValidRectangle(preferredCorners)) {
    return preferredCorners
  }
  if (fallbackCorners && isValidRectangle(fallbackCorners)) {
    return fallbackCorners
  }
}
