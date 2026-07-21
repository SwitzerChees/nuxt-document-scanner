import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import jpeg from 'jpeg-js'
import {
  decodeCornerHeatmaps,
  preprocessDocAlignerInput,
} from '../src/runtime/utils/model-contract'
import { evaluateQuad } from '../src/runtime/utils/quality-metrics'
import manifest from './fixtures/quality/manifest.json'

const require = createRequire(import.meta.url)

const ort = require('onnxruntime-web') as typeof import('onnxruntime-web')

ort.env.wasm.numThreads = 1
ort.env.wasm.proxy = false
ort.env.wasm.wasmPaths = `${resolve('node_modules/onnxruntime-web/dist')}/`

let session: import('onnxruntime-web').InferenceSession | undefined

afterAll(async () => {
  await session?.release()
})

describe('bundled model quality', () => {
  it('matches the official DocAligner reference fixture', async () => {
    const fixture = manifest.fixtures[0]!
    const encoded = await readFile(resolve('test/fixtures/quality', fixture.file))
    const decoded = jpeg.decode(encoded, { formatAsRGBA: true, useTArray: true })
    const input = preprocessDocAlignerInput({
      data: decoded.data,
      width: decoded.width,
      height: decoded.height,
    })
    session ||= await ort.InferenceSession.create(
      resolve('src/runtime/public/models/lcnet100_h_e_bifpn_256_fp32.onnx'),
      { executionProviders: ['wasm'], graphOptimizationLevel: 'all' },
    )
    const output = await session.run({
      img: new ort.Tensor('float32', input.data, input.dims),
    })
    const heatmap = output.heatmap
    expect(heatmap).toBeDefined()
    const detection = decodeCornerHeatmaps({
      outputData: heatmap!.data as Float32Array,
      outputShape: heatmap!.dims,
      imageWidth: decoded.width,
      imageHeight: decoded.height,
    })
    expect(detection.corners).toBeDefined()
    const quality = evaluateQuad(
      detection.corners!,
      fixture.expectedCorners,
      decoded.width,
      decoded.height,
    )
    expect(quality.cornerNme).toBeLessThan(0.01)
    expect(quality.polygonIou).toBeGreaterThan(0.95)
    expect(detection.confidence).toBeGreaterThan(0.5)
  }, 30_000)
})
