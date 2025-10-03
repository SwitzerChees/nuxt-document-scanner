/**
 * Edge Detection Worker
 * Handles ONNX model inference for edge detection
 * Runs off main thread for better performance
 */

// @ts-ignore - web worker global
declare const self: DedicatedWorkerGlobalScope
import * as ort from 'onnxruntime-web'

interface InitPayload {
  modelPath: string
  prefer?: 'webgpu' | 'wasm'
  isMobile?: boolean
}

interface InferPayload {
  rgba: ImageData
  w: number
  h: number
  threshold?: number
  targetRes?: number
}

let session: ort.InferenceSession | undefined
let inputName: string | undefined
let inputChannels = 3
let isMobileDevice = false
let actualExecutionProvider = 'unknown'

/**
 * Load and initialize ONNX model
 */
async function loadModel(payload: InitPayload): Promise<void> {
  isMobileDevice = payload.isMobile || false

  // Configure WASM for optimal performance
  ort.env.wasm.wasmPaths =
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/'
  ort.env.wasm.numThreads = Math.min(
    4,
    self.navigator?.hardwareConcurrency || 4,
  )
  ort.env.wasm.simd = true
  ort.env.wasm.proxy = false

  const prefer = payload.prefer || 'wasm'
  const executionProviders: any[] = []

  if (prefer === 'webgpu') {
    executionProviders.push('webgpu')
  }
  executionProviders.push('wasm')

  console.log('🔧 Initializing ONNX Runtime:', {
    prefer,
    isMobile: isMobileDevice,
    threads: ort.env.wasm.numThreads,
  })

  const sessionOptions: ort.InferenceSession.SessionOptions = {
    executionProviders,
    graphOptimizationLevel: 'all',
    executionMode: 'parallel',
    enableCpuMemArena: true,
    enableMemPattern: true,
  }

  try {
    session = await ort.InferenceSession.create(
      payload.modelPath,
      sessionOptions,
    )

    // Detect actual execution provider
    const backend =
      (session as any)?.handler?._inferenceHandler?._backend ||
      (session as any)?.handler?.backendType ||
      'unknown'

    actualExecutionProvider = String(backend)
    console.log(
      '✅ ONNX session created with backend:',
      actualExecutionProvider,
    )
  } catch (err) {
    if (prefer === 'webgpu') {
      console.log('⚠️ WebGPU failed, falling back to WASM')

      const wasmOptions: ort.InferenceSession.SessionOptions = {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
        executionMode: 'parallel',
        enableCpuMemArena: true,
        enableMemPattern: true,
      }

      session = await ort.InferenceSession.create(
        payload.modelPath,
        wasmOptions,
      )
      actualExecutionProvider = 'wasm'
    } else {
      throw err
    }
  }

  // Resolve input metadata
  inputName = session!.inputNames?.[0] ?? 'input'

  try {
    const metadata = (session as any).inputMetadata?.[inputName]
    const dims = metadata?.dimensions as
      | (number | string | null | undefined)[]
      | undefined
    const channels = typeof dims?.[1] === 'number' ? dims[1] : undefined

    if (channels === 1 || channels === 3) {
      inputChannels = channels
    }
  } catch {
    // Use default
  }

  console.log('📊 Model info:', {
    inputName,
    inputChannels,
    executionProvider: actualExecutionProvider,
  })
}

/**
 * Preprocess image for ONNX model
 * Resize and normalize to expected input format
 */
function preprocess(
  rgba: ImageData,
  w: number,
  h: number,
  targetRes?: number,
): { data: Float32Array; tw: number; th: number; channels: number } {
  const target = targetRes || (isMobileDevice ? 256 : 384)
  const scale = Math.min(target / w, target / h)
  const tw = Math.round(w * scale)
  const th = Math.round(h * scale)
  const invScale = 1 / scale
  const inv255 = 1 / 255

  if (inputChannels === 1) {
    // Grayscale input
    const ch0 = new Float32Array(tw * th)
    let idx = 0

    for (let y = 0; y < th; y++) {
      const sy = Math.floor(y * invScale)
      const rowOffset = sy * w

      for (let x = 0; x < tw; x++) {
        const sx = Math.floor(x * invScale)
        const i = (rowOffset + sx) << 2
        const r = rgba.data[i] || 0
        const g = rgba.data[i + 1] || 0
        const b = rgba.data[i + 2] || 0

        // Luminance conversion
        ch0[idx++] = (0.299 * r + 0.587 * g + 0.114 * b) * inv255
      }
    }

    return { data: ch0, tw, th, channels: 1 }
  } else {
    // RGB input (CHW format)
    const size = tw * th
    const data = new Float32Array(3 * size)
    let idx = 0

    for (let y = 0; y < th; y++) {
      const sy = Math.floor(y * invScale)
      const rowOffset = sy * w

      for (let x = 0; x < tw; x++) {
        const sx = Math.floor(x * invScale)
        const i = (rowOffset + sx) << 2

        // CHW format: all R, then all G, then all B
        data[idx] = (rgba.data[i] || 0) * inv255
        data[idx + size] = (rgba.data[i + 1] || 0) * inv255
        data[idx + (size << 1)] = (rgba.data[i + 2] || 0) * inv255
        idx++
      }
    }

    return { data, tw, th, channels: 3 }
  }
}

/**
 * Postprocess model output to binary edge map
 */
function postprocess(
  map: Float32Array,
  w: number,
  h: number,
  threshold: number,
): ImageData {
  const size = w * h
  const out = new Uint8ClampedArray(size * 4)
  let j = 0

  for (let i = 0; i < size; i++) {
    const value = (map[i] || 0) > threshold ? 255 : 0
    out[j++] = value
    out[j++] = value
    out[j++] = value
    out[j++] = 255
  }

  return new ImageData(out, w, h)
}

/**
 * Worker message handler
 */
self.onmessage = async (e) => {
  const { type, payload } = e.data

  if (type === 'init') {
    await loadModel(payload as InitPayload)
    self.postMessage({
      type: 'ready',
      executionProvider: actualExecutionProvider,
    })
    return
  }

  if (type === 'infer') {
    if (!session) {
      console.warn('Session not initialized')
      return
    }

    const { rgba, w, h, threshold, targetRes } = payload as InferPayload

    // Preprocess
    const pre = preprocess(rgba, w, h, targetRes)

    // Create tensor
    const input = new ort.Tensor('float32', pre.data, [
      1,
      pre.channels,
      pre.th,
      pre.tw,
    ])

    // Run inference
    const feeds: Record<string, ort.Tensor> = {}
    const name = inputName || session.inputNames?.[0] || 'input'
    feeds[name] = input

    const result = await session.run(feeds)

    // Get output
    const outputKey = Object.keys(result)[0]
    if (!outputKey) return

    const tensorData = result[outputKey]?.data
    if (!tensorData) return

    const logits = tensorData as Float32Array

    // Postprocess
    const edge = postprocess(logits, pre.tw, pre.th, threshold || 0.5)

    // Send back to main thread
    self.postMessage({
      type: 'edge',
      edge,
      scale: w / pre.tw,
    })
  }
}
