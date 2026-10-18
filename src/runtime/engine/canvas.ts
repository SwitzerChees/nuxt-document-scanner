import type { RgbaImage } from './image'

type Drawable = ImageBitmap | OffscreenCanvas
const context = (canvas: OffscreenCanvas, readBack = false) => {
  const ctx = canvas.getContext('2d', { willReadFrequently: readBack })

  if (!ctx)
    throw new Error('2D canvas is not available')

  return ctx
}
/**
 * Downscales by repeated halving before the final resize, so every output pixel averages its whole source area.
 * A single large drawImage step (or nearest-neighbour sampling) aliases text and edges into noise for the model.
 */
export const resizeToRgba = (source: Drawable, width: number, height: number): RgbaImage => {
  let current: Drawable = source

  let currentWidth = source.width

  let currentHeight = source.height

  while (currentWidth > width * 2 || currentHeight > height * 2) {
    const nextWidth = currentWidth > width * 2 ? Math.round(currentWidth / 2) : currentWidth

    const nextHeight = currentHeight > height * 2 ? Math.round(currentHeight / 2) : currentHeight

    const step = new OffscreenCanvas(nextWidth, nextHeight)

    const ctx = context(step)

    ctx.imageSmoothingQuality = 'high'

    ctx.drawImage(current, 0, 0, nextWidth, nextHeight)

    current = step

    currentWidth = nextWidth

    currentHeight = nextHeight
  }

  const out = new OffscreenCanvas(width, height)

  const ctx = context(out, true)

  ctx.imageSmoothingQuality = 'high'

  ctx.drawImage(current, 0, 0, width, height)

  return ctx.getImageData(0, 0, width, height)
}
export const bitmapToRgba = (bitmap: ImageBitmap): RgbaImage => {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)

  const ctx = context(canvas, true)

  ctx.drawImage(bitmap, 0, 0)

  return ctx.getImageData(0, 0, bitmap.width, bitmap.height)
}
export const encodeJpeg = (image: RgbaImage, quality: number) => {
  const canvas = new OffscreenCanvas(image.width, image.height)

  context(canvas).putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0)

  return canvas.convertToBlob({ type: 'image/jpeg', quality })
}
/** A full-resolution window of the bitmap, for measurements that need detail but not the whole frame. */
export const cropToRgba = (bitmap: ImageBitmap, region: {
  x: number;
  y: number;
  width: number;
  height: number;
}): RgbaImage => {
  const x = Math.max(0, Math.floor(region.x))

  const y = Math.max(0, Math.floor(region.y))

  const width = Math.max(1, Math.min(bitmap.width - x, Math.round(region.width)))

  const height = Math.max(1, Math.min(bitmap.height - y, Math.round(region.height)))

  const canvas = new OffscreenCanvas(width, height)

  const ctx = context(canvas, true)

  ctx.drawImage(bitmap, x, y, width, height, 0, 0, width, height)

  return ctx.getImageData(0, 0, width, height)
}
