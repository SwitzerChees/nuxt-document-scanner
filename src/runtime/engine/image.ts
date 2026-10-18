/** Structurally compatible with ImageData, so it works in workers, tests and on the main thread alike. */
export type RgbaImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
export type Rotation = 0 | 90 | 180 | 270
export const createRgbaImage = (width: number, height: number): RgbaImage => ({
  data: new Uint8ClampedArray(width * height * 4),
  width,
  height,
})
export const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b
/** Bilinearly interpolated luminance at a continuous pixel position (pixel i covers [i, i + 1)). */
export const sampleLuma = (image: RgbaImage, x: number, y: number) => {
  const { data, width, height } = image

  const fx = Math.min(width - 1, Math.max(0, x - 0.5))

  const fy = Math.min(height - 1, Math.max(0, y - 0.5))

  const x0 = Math.floor(fx)

  const y0 = Math.floor(fy)

  const x1 = Math.min(width - 1, x0 + 1)

  const y1 = Math.min(height - 1, y0 + 1)

  const ax = fx - x0

  const ay = fy - y0

  const at = (px: number, py: number) => {
    const i = (py * width + px) * 4

    return luma(data[i]!, data[i + 1]!, data[i + 2]!)
  }

  const top = at(x0, y0) * (1 - ax) + at(x1, y0) * ax

  const bottom = at(x0, y1) * (1 - ax) + at(x1, y1) * ax

  return top * (1 - ay) + bottom * ay
}
export const rotateImage = (image: RgbaImage, rotation: Rotation): RgbaImage => {
  if (rotation === 0)
    return image

  const { width, height, data } = image

  const swap = rotation !== 180

  const out = createRgbaImage(swap ? height : width, swap ? width : height)

  const source = new Uint32Array(data.buffer, data.byteOffset, width * height)

  const target = new Uint32Array(out.data.buffer)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let index: number

      if (rotation === 90)
        index = x * out.width + (height - 1 - y)
      else if (rotation === 180)
        index = (height - 1 - y) * width + (width - 1 - x)
      else
        index = (width - 1 - x) * out.width + y

      target[index] = source[y * width + x]!
    }
  }

  return out
}
