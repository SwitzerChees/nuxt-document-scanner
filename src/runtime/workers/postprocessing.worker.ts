/// <reference lib="webworker" />
import { bitmapToRgba, encodeJpeg } from '../engine/canvas'
import { sharpest, encodeScaled, scaled } from '../engine/bitmap-processing'
import type { Quad } from '../engine/geometry'
import { BLUR_THRESHOLD, blurScore } from '../engine/sharpness'
import { processDocumentPixels } from '../utils/processing-core'
import type { ProcessingOptions } from '../utils/processing-core'

const scope = self as unknown as DedicatedWorkerGlobalScope
scope.onmessage = async ({ data: { id, payload } }) => {
  let frames: ImageBitmap[] = payload.frames ?? []

  try {
    if (payload.source)
      frames = [await createImageBitmap(payload.source)]

    const { width, height } = frames[0]!

    const corners: number[] = payload.normalizedQuad ? payload.normalizedQuad.map((v: number, i: number) => v * (i % 2 ? height : width)) : payload.corners

    const quad = [0, 2, 4, 6].map(i => ({ x: corners[i]!, y: corners[i + 1]! })) as Quad

    const frame = bitmapToRgba(sharpest(frames, quad)) as ImageData

    frames.forEach(bitmap => bitmap.close())

    frames = []

    const result = processDocumentPixels(frame, corners, payload.options as ProcessingOptions)

    if (!result)
      throw new Error('The document perspective could not be resolved.')

    const blur = blurScore(scaled(result.imageData, 1400))

    const blurry = blur !== undefined && blur > BLUR_THRESHOLD

    if (blurry && !result.quality.warnings.includes('hold-still'))
      result.quality.warnings.push('hold-still')

    result.quality.acceptableForAutoCapture = result.quality.warnings.length === 0

    scope.postMessage({ id, result: {
      // Reuse the kept original when editing: repeated edits never recompress it.
      source: payload.retainSource === false ? undefined : payload.source ?? await encodeJpeg(frame, 0.9),
      processed: await encodeJpeg(result.imageData, payload.jpegQuality),
      preview: await encodeScaled(result.imageData, 1280, 0.88),
      thumbnail: await encodeScaled(result.imageData, payload.thumbnailLongEdge, 0.8),
      sourceWidth: width, sourceHeight: height,
      outputWidth: result.imageData.width, outputHeight: result.imageData.height,
      corners: result.corners, quality: result.quality, recipe: result.recipe, blurry,
    } })
  }
  catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  }
  finally {
    frames.forEach(bitmap => bitmap.close())
  }
}
