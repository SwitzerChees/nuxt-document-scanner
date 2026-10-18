import { validateDocumentQuad } from './document-geometry'

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
  canProjectLiveCorners?: boolean
}) => {
  const liveCorners =
    input.liveCorners &&
    input.isHighResolution &&
    input.canProjectLiveCorners &&
    input.liveFrameSize
      ? scaleCornersBetweenSizes(
          input.liveCorners,
          input.liveFrameSize,
          input.finalFrameSize,
        )
      : input.isHighResolution
        ? undefined
        : input.liveCorners
  const preferredCorners = input.isHighResolution
    ? liveCorners
    : input.detectedCorners
  const fallbackCorners = input.isHighResolution
    ? input.detectedCorners
    : liveCorners
  const validDetectedCorners =
    input.detectedCorners &&
    validateDocumentQuad(input.detectedCorners, {
      frameSize: input.finalFrameSize,
    }).valid
      ? input.detectedCorners
      : undefined
  const validLiveCorners =
    liveCorners &&
    validateDocumentQuad(liveCorners, { frameSize: input.finalFrameSize }).valid
      ? liveCorners
      : undefined

  if (input.isHighResolution) {
    // Detection on the frame that will actually be saved is authoritative.
    // A still photo or a constraint-switched frame may have a different field
    // of view from the preview even when its dimensions look compatible.
    if (validDetectedCorners) return validDetectedCorners
    if (validLiveCorners) return validLiveCorners
  }

  if (
    preferredCorners &&
    validateDocumentQuad(preferredCorners, { frameSize: input.finalFrameSize }).valid
  ) {
    return preferredCorners
  }
  if (
    fallbackCorners &&
    validateDocumentQuad(fallbackCorners, { frameSize: input.finalFrameSize }).valid
  ) {
    return fallbackCorners
  }
}
