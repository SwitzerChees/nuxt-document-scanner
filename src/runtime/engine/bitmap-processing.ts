import { cropToRgba } from './canvas'
import { quadCenter } from './geometry'
import type { Quad as Corners } from './geometry'
import type { RgbaImage } from './image'
import { sharpnessScore } from './sharpness'

const FOCUS_WINDOW = 384
export const sharpest = (bitmaps: ImageBitmap[], corners: Corners) => {
  if (bitmaps.length === 1)
    return bitmaps[0]!

  const center = quadCenter(corners)

  const anchors = [center, ...corners.map(p => ({ x: p.x + (center.x - p.x) * 0.2, y: p.y + (center.y - p.y) * 0.2 }))]

  let best = bitmaps[0]!, bestScore = -Infinity

  for (const bitmap of bitmaps) {
    let score = 0

    for (const a of anchors) {
      const window = cropToRgba(bitmap, { x: a.x - FOCUS_WINDOW / 2, y: a.y - FOCUS_WINDOW / 2, width: FOCUS_WINDOW, height: FOCUS_WINDOW })

      score += Math.log1p(sharpnessScore(window, undefined, 1))
    }

    if (score > bestScore) {
      bestScore = score

      best = bitmap
    }
  }

  return best
}
export const encodeScaled = async (image: RgbaImage, edge: number, quality: number) => {
  const scale = Math.min(1, edge / Math.max(image.width, image.height))

  const canvas = new OffscreenCanvas(image.width, image.height)

  canvas.getContext('2d')!.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0)

  const target = new OffscreenCanvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)))

  const ctx = target.getContext('2d')!

  ctx.imageSmoothingQuality = 'high'

  ctx.drawImage(canvas, 0, 0, target.width, target.height)

  try {
    return await target.convertToBlob({ type: 'image/jpeg', quality })
  }
  finally {
    canvas.width = canvas.height = target.width = target.height = 1
  }
}
export const scaled = (image: RgbaImage, edge: number): RgbaImage => {
  const scale = Math.min(1, edge / Math.max(image.width, image.height))

  if (scale === 1)
    return image

  const canvas = new OffscreenCanvas(image.width, image.height)

  canvas.getContext('2d')!.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0)

  const target = new OffscreenCanvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)))

  const ctx = target.getContext('2d', { willReadFrequently: true })!

  ctx.imageSmoothingQuality = 'high'

  ctx.drawImage(canvas, 0, 0, target.width, target.height)

  try {
    return ctx.getImageData(0, 0, target.width, target.height)
  }
  finally {
    canvas.width = canvas.height = target.width = target.height = 1
  }
}
