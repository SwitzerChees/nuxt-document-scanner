export type SyntheticQualityFixture = {
  id: string
  imageData: ImageData
  corners: number[]
  tags: string[]
}

const createImageData = (data: Uint8ClampedArray, width: number, height: number) =>
  ({ data, width, height, colorSpace: 'srgb' }) as ImageData

const insidePolygon = (x: number, y: number, corners: number[]) => {
  let inside = false
  for (let current = 0, previous = 3; current < 4; previous = current++) {
    const currentX = corners[current * 2]!
    const currentY = corners[current * 2 + 1]!
    const previousX = corners[previous * 2]!
    const previousY = corners[previous * 2 + 1]!
    if (
      (currentY > y) !== (previousY > y) &&
      x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX
    ) {
      inside = !inside
    }
  }
  return inside
}

const seededRandom = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

export const createSyntheticQualityCorpus = (count = 64) => {
  const random = seededRandom(0x5CA11E)
  return Array.from({ length: count }, (_, index): SyntheticQualityFixture => {
    const width = 320
    const height = 240
    const documentType = ['page', 'receipt', 'card'][index % 3]!
    const isReceipt = documentType === 'receipt'
    const isCard = documentType === 'card'
    const baseLeft = isReceipt ? 105 : isCard ? 48 : 42
    const baseRight = isReceipt ? 210 : isCard ? 275 : 282
    const baseTop = isCard ? 55 : 22
    const baseBottom = isCard ? 187 : 220
    const jitter = () => Math.round((random() - 0.5) * 22)
    const corners = [
      baseLeft + jitter(),
      baseTop + jitter(),
      baseRight + jitter(),
      baseTop + jitter(),
      baseRight + jitter(),
      baseBottom + jitter(),
      baseLeft + jitter(),
      baseBottom + jitter(),
    ]
    const darkBackground = index % 2 === 0
    const hasShadow = index % 4 !== 0
    const hasGlare = index % 7 === 0
    const hasColor = index % 5 === 0
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4
        const documentPixel = insidePolygon(x, y, corners)
        const background = darkBackground ? 22 : 178
        let value = documentPixel ? 242 : background
        if (documentPixel && hasShadow) value -= Math.round((x / width) * 52)
        if (documentPixel && y % 22 < 3) value -= 105
        data[offset] = value
        data[offset + 1] = hasColor && documentPixel && y % 58 < 10 ? value * 0.58 : value
        data[offset + 2] = hasColor && documentPixel && y % 58 < 10 ? value * 0.42 : value
        if (hasGlare && documentPixel && (x - 225) ** 2 + (y - 70) ** 2 < 22 ** 2) {
          data[offset] = 255
          data[offset + 1] = 255
          data[offset + 2] = 255
        }
        data[offset + 3] = 255
      }
    }
    const tags = [
      documentType,
      darkBackground ? 'dark-background' : 'light-background',
      hasShadow ? 'shadow' : 'even-light',
      hasGlare ? 'glare' : 'no-glare',
      hasColor ? 'color' : 'neutral',
    ]
    return {
      id: `synthetic-${String(index + 1).padStart(3, '0')}`,
      imageData: createImageData(data, width, height),
      corners,
      tags,
    }
  })
}
