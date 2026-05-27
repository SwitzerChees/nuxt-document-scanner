export type ImageRotation = 'clockwise' | 'counterclockwise'

type FrameLike = {
  width: number
  height: number
}

export const hasDifferentOrientation = (
  reference: FrameLike,
  candidate: FrameLike,
) => {
  const referenceLandscape = reference.width > reference.height * 1.05
  const referencePortrait = reference.height > reference.width * 1.05
  const candidateLandscape = candidate.width > candidate.height * 1.05
  const candidatePortrait = candidate.height > candidate.width * 1.05

  return (
    (referenceLandscape && candidatePortrait) ||
    (referencePortrait && candidateLandscape)
  )
}

export const rotateImageData = (
  imageData: ImageData,
  rotation: ImageRotation,
) => {
  const sourceWidth = imageData.width
  const sourceHeight = imageData.height
  const output = new Uint8ClampedArray(imageData.data.length)
  const outputWidth = sourceHeight
  const outputHeight = sourceWidth

  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      const sourceIndex = (y * sourceWidth + x) * 4
      const outputX =
        rotation === 'clockwise'
          ? sourceHeight - 1 - y
          : y
      const outputY =
        rotation === 'clockwise'
          ? x
          : sourceWidth - 1 - x
      const outputIndex = (outputY * outputWidth + outputX) * 4

      output[outputIndex] = imageData.data[sourceIndex]!
      output[outputIndex + 1] = imageData.data[sourceIndex + 1]!
      output[outputIndex + 2] = imageData.data[sourceIndex + 2]!
      output[outputIndex + 3] = imageData.data[sourceIndex + 3]!
    }
  }

  return new ImageData(output, outputWidth, outputHeight)
}

const luminanceAt = (imageData: ImageData, x: number, y: number) => {
  const index =
    (Math.min(imageData.height - 1, Math.max(0, y)) * imageData.width +
      Math.min(imageData.width - 1, Math.max(0, x))) *
    4
  return (
    imageData.data[index]! * 0.299 +
    imageData.data[index + 1]! * 0.587 +
    imageData.data[index + 2]! * 0.114
  )
}

export const scoreFrameSimilarity = (
  reference: ImageData,
  candidate: ImageData,
  samples = 28,
) => {
  let diff = 0
  let count = 0
  const sampleCount = Math.max(8, samples)

  for (let y = 0; y < sampleCount; y++) {
    for (let x = 0; x < sampleCount; x++) {
      const referenceX = Math.floor(
        ((x + 0.5) / sampleCount) * reference.width,
      )
      const referenceY = Math.floor(
        ((y + 0.5) / sampleCount) * reference.height,
      )
      const candidateX = Math.floor(
        ((x + 0.5) / sampleCount) * candidate.width,
      )
      const candidateY = Math.floor(
        ((y + 0.5) / sampleCount) * candidate.height,
      )
      diff += Math.abs(
        luminanceAt(reference, referenceX, referenceY) -
          luminanceAt(candidate, candidateX, candidateY),
      )
      count++
    }
  }

  return count ? diff / count : Number.POSITIVE_INFINITY
}

export const alignImageDataToReference = (
  imageData: ImageData,
  reference: ImageData,
) => {
  if (!hasDifferentOrientation(reference, imageData)) {
    return { imageData }
  }

  const clockwise = rotateImageData(imageData, 'clockwise')
  const counterclockwise = rotateImageData(imageData, 'counterclockwise')
  const clockwiseScore = scoreFrameSimilarity(reference, clockwise)
  const counterclockwiseScore = scoreFrameSimilarity(reference, counterclockwise)

  return clockwiseScore <= counterclockwiseScore
    ? { imageData: clockwise, rotation: 'clockwise' as const }
    : { imageData: counterclockwise, rotation: 'counterclockwise' as const }
}
