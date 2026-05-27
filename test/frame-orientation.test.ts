import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  alignImageDataToReference,
  rotateImageData,
} from '../src/runtime/utils/frame-orientation'

class TestImageData {
  data: Uint8ClampedArray
  width: number
  height: number

  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data
    this.width = width
    this.height = height
  }
}

vi.stubGlobal('ImageData', TestImageData)

afterAll(() => {
  vi.unstubAllGlobals()
})

const createImageData = (width: number, height: number, values: number[]) => {
  const data = new Uint8ClampedArray(width * height * 4)
  values.forEach((value, index) => {
    const offset = index * 4
    data[offset] = value
    data[offset + 1] = value
    data[offset + 2] = value
    data[offset + 3] = 255
  })
  return new ImageData(data, width, height)
}

describe('frame orientation alignment', () => {
  it('rotates a landscape capture back to the preview orientation', () => {
    const reference = createImageData(2, 3, [10, 20, 30, 40, 50, 60])
    const sidewaysCapture = rotateImageData(reference, 'counterclockwise')

    const aligned = alignImageDataToReference(sidewaysCapture, reference)

    expect(aligned.rotation).toBe('clockwise')
    expect(aligned.imageData.width).toBe(reference.width)
    expect(aligned.imageData.height).toBe(reference.height)
    expect(Array.from(aligned.imageData.data)).toEqual(
      Array.from(reference.data),
    )
  })

  it('keeps frames unchanged when orientation already matches', () => {
    const reference = createImageData(2, 3, [10, 20, 30, 40, 50, 60])
    const candidate = createImageData(4, 6, [
      10, 10, 20, 20,
      10, 10, 20, 20,
      30, 30, 40, 40,
      30, 30, 40, 40,
      50, 50, 60, 60,
      50, 50, 60, 60,
    ])

    const aligned = alignImageDataToReference(candidate, reference)

    expect(aligned.rotation).toBeUndefined()
    expect(aligned.imageData).toBe(candidate)
  })
})
