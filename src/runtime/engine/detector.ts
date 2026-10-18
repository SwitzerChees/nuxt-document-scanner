import * as ort from 'onnxruntime-web/wasm'
import { decodeHeatmaps } from './heatmap'
import type { HeatmapDetection } from './heatmap'
import type { RgbaImage } from './image'
/** The model takes the whole frame squeezed to a square of this size. */
export const MODEL_INPUT_SIZE = 256
export type CornerDetectorOptions = {
  /** URL of the ONNX file, or its bytes. */
  model: string | Uint8Array;
  /** URL of `ort-wasm-simd-threaded.wasm`; required when the bundler does not emit it next to the runtime. */
  inputSize?: number;
  inputName?: string;
  wasmUrl?: string;
}
export type Heatmaps = {
  data: Float32Array;
  channels: number;
  height: number;
  width: number;
}
export type CornerDetection = HeatmapDetection & {
  inferenceMs: number;
}
/** One ONNX Runtime session for the DocAligner corner model; meant to live inside a worker. */
export class CornerDetector {
  private readonly input: Float32Array
  private constructor(private readonly session: ort.InferenceSession, private readonly size: number, private readonly inputName?: string) {
    this.input = new Float32Array(3 * size * size)
  }
  static async create(options: CornerDetectorOptions) {
    if (options.wasmUrl)
      ort.env.wasm.wasmPaths = { wasm: options.wasmUrl, mjs: new URL('ort-wasm-simd-threaded.mjs', options.wasmUrl).href }

    // Several threads need cross-origin isolation (COOP/COEP), which would break the app's embeds. The model is small
    // (1.6 GFLOPs), so one SIMD thread keeps up with the ~10 detections per second the scanner asks for.

    ort.env.wasm.numThreads = 1

    ort.env.wasm.proxy = false

    const sessionOptions: ort.InferenceSession.SessionOptions = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }

    const session = typeof options.model === 'string'
      ? await ort.InferenceSession.create(options.model, sessionOptions)
      : await ort.InferenceSession.create(options.model, sessionOptions)

    return new CornerDetector(session, options.inputSize ?? MODEL_INPUT_SIZE, options.inputName)
  }
  /** Runs the model on a `MODEL_INPUT_SIZE` square RGBA image and returns the raw heatmaps. */
  async heatmaps(pixels: RgbaImage): Promise<Heatmaps> {
    if (pixels.width !== this.size || pixels.height !== this.size) {
      throw new Error(`Model input must be ${this.size}x${this.size}`)
    }

    const { data } = pixels

    const plane = this.size * this.size

    const input = this.input

    for (let i = 0, p = 0; p < plane; i += 4, p++) {
      input[p] = data[i]! / 255

      input[p + plane] = data[i + 1]! / 255

      input[p + 2 * plane] = data[i + 2]! / 255
    }

    const tensor = new ort.Tensor('float32', input, [1, 3, this.size, this.size])

    const outputs = await this.session.run({ [this.inputName || this.session.inputNames[0]!]: tensor })

    const output = outputs[this.session.outputNames[0]!]!

    const [, channels, height, width] = output.dims as number[]

    return { data: output.data as Float32Array, channels: channels!, height: height!, width: width! }
  }
  async detect(pixels: RgbaImage): Promise<CornerDetection> {
    const started = performance.now()

    const { data, channels, height, width } = await this.heatmaps(pixels)

    return { ...decodeHeatmaps(data, channels, height, width), inferenceMs: performance.now() - started }
  }
  async dispose() {
    await this.session.release()
  }
}
