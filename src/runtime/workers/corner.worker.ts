/// <reference lib="webworker" />
import { quality } from '../core/quality'
import { bitmapToRgba, resizeToRgba } from '../engine/canvas'
import { CornerDetector, MODEL_INPUT_SIZE } from '../engine/detector'
import { orderQuad } from '../engine/geometry'
import type { Quad } from '../types'

const scope = self as unknown as DedicatedWorkerGlobalScope
let detector: CornerDetector | undefined
let inputSize = MODEL_INPUT_SIZE
scope.onmessage = async ({ data: { id, type, payload } }) => {
  try {
    if (type === 'init') {
      inputSize = payload.modelResolution ?? MODEL_INPUT_SIZE
      detector = await CornerDetector.create({
        model: payload.modelPath,
        inputSize,
        inputName: payload.inputName,
        wasmUrl: new URL('ort-wasm-simd-threaded.wasm', payload.onnxPath.endsWith('/') ? payload.onnxPath : `${payload.onnxPath}/`).href,
      })
      scope.postMessage({ id, result: true })
      return
    }
    const bitmap: ImageBitmap = payload.videoFrame
    try {
      if (!detector) throw new Error('Detector is not ready.')
      const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height))
      const frame = scale < 1 ? resizeToRgba(bitmap, Math.round(bitmap.width * scale), Math.round(bitmap.height * scale)) : bitmapToRgba(bitmap)
      const result = await detector.detect(resizeToRgba(bitmap, inputSize, inputSize))
      const corners = orderQuad(result.points.map(p => ({ x: p.x * frame.width, y: p.y * frame.height }))).flatMap(p => [p.x, p.y]) as Quad
      scope.postMessage({ id, result: {
        corners,
        confidence: Math.min(...result.confidences),
        width: frame.width,
        height: frame.height,
        ...quality(frame, corners),
      } })
    } finally { bitmap.close() }
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  }
}
