/**
 * DocAligner Corner Detection Worker
 * Handles ONNX model inference for direct document corner detection
 * Runs off main thread for better performance
 */

import * as ort from 'onnxruntime-web'

declare const self: DedicatedWorkerGlobalScope

type InitPayload = {
  modelPath: string
  onnxPath: string
  modelResolution: number
  prefer: 'wasm'
  threads: number
  inputName: string
}

type InferPayload = {
  rgba: ImageData
}

let session: ort.InferenceSession | undefined
let actualExecutionProvider = 'unknown'
let isInitializing = false
let modelResolution = 256
let inputName = 'input'

async function loadModel(payload: InitPayload): Promise<void> {
  if (isInitializing) {
    console.warn('⚠️ Already initializing, waiting...')
    return
  }

  const {
    modelPath,
    onnxPath,
    modelResolution: _modelResolution,
    prefer,
    threads,
    inputName: _inputName,
  } = payload

  modelResolution = _modelResolution
  inputName = _inputName

  isInitializing = true

  await new Promise((resolve) => setTimeout(resolve, 100))

  try {
    ort.env.wasm.wasmPaths = onnxPath
    ort.env.wasm.numThreads = threads
    ort.env.wasm.simd = true
    ort.env.wasm.proxy = false

    const executionProviders: string[] = []

    executionProviders.push(prefer)

    console.log('🔧 Initializing ONNX Runtime:', {
      prefer,
      threads: ort.env.wasm.numThreads,
    })

    const sessionOptions: ort.InferenceSession.SessionOptions = {
      executionProviders,
      graphOptimizationLevel: 'all',
      executionMode: 'parallel',
      enableCpuMemArena: false,
      enableMemPattern: false,
    }

    console.log('📥 Loading model from:', modelPath)
    session = await ort.InferenceSession.create(modelPath, sessionOptions)

    console.log('✅ Model loaded successfully')
    console.log(
      '🔧 Execution providers available:',
      ort.env.availableExecutionProviders,
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
  } catch (error) {
    console.error('❌ Failed to load ONNX model:', error)
    isInitializing = false
    throw new Error(
      `Failed to initialize ONNX Runtime: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    )
  }

  isInitializing = false
}

function preprocess(rgba: ImageData) {
  const w = rgba.width
  const h = rgba.height
  // DocAligner models require SQUARE input (typically 256x256)
  const target = modelResolution
  const tw = target
  const th = target

  // Calculate scale factors for width and height independently
  const scaleX = w / tw
  const scaleY = h / th

  // Resize image to square (non-uniform scaling if aspect ratio differs)
  const resized = new Uint8ClampedArray(tw * th * 4)

  for (let y = 0; y < th; y++) {
    const sy = Math.floor(y * scaleY)
    const rowOffset = sy * w

    for (let x = 0; x < tw; x++) {
      const sx = Math.floor(x * scaleX)
      const srcIdx = (rowOffset + sx) * 4
      const dstIdx = (y * tw + x) * 4

      resized[dstIdx] = rgba.data[srcIdx]!
      resized[dstIdx + 1] = rgba.data[srcIdx + 1]!
      resized[dstIdx + 2] = rgba.data[srcIdx + 2]!
      resized[dstIdx + 3] = 255
    }
  }

  // Convert to CHW format and normalize to [0, 1]
  const size = tw * th
  const data = new Float32Array(3 * size)
  const inv255 = 1 / 255

  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const i = (y * tw + x) * 4
      const idx = y * tw + x

      // CHW format: all R, then all G, then all B
      data[idx] = (resized[i] || 0) * inv255
      data[idx + size] = (resized[i + 1] || 0) * inv255
      data[idx + (size << 1)] = (resized[i + 2] || 0) * inv255
    }
  }

  return { data, tw, th, channels: 3, scaleX, scaleY }
}

const initModel = async (payload: InitPayload) => {
  try {
    await loadModel(payload as InitPayload)
    self.postMessage({
      type: 'ready',
      executionProvider: actualExecutionProvider,
    })
  } catch (error) {
    console.error('Worker init error:', error)
    isInitializing = false
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    })
  }
  return
}

const infer = async (payload: InferPayload) => {
  if (!session) {
    console.warn('Session not initialized')
    return
  }

  const { rgba } = payload as InferPayload
  const pre = preprocess(rgba)

  const input = new ort.Tensor('float32', pre.data, [
    1,
    pre.channels,
    pre.th,
    pre.tw,
  ])

  const feeds: Record<string, ort.Tensor> = {}
  const name = inputName || session.inputNames?.[0] || 'input'
  feeds[name] = input

  const result = await session.run(feeds)

  const outputKey = Object.keys(result)[0]
  if (!outputKey) {
    console.warn('No output from model')
    self.postMessage({
      type: 'corners',
      corners: undefined,
      confidence: 0.0,
    })
    return
  }

  const outputTensor = result[outputKey]
  if (!outputTensor || !outputTensor.data) {
    console.warn('Invalid output tensor')
    self.postMessage({
      type: 'corners',
      corners: undefined,
      confidence: 0.0,
    })
    return
  }

  const outputData = outputTensor.data as Float32Array

  const corners = outputData.slice(0, 8)
  const confidence = outputData[8]

  self.postMessage({
    type: 'corners',
    corners,
    confidence,
  })
}

self.onmessage = async (e) => {
  const { type, payload } = e.data

  if (type === 'init') {
    await initModel(payload as InitPayload)
    return
  }

  if (type === 'infer') {
    await infer(payload as InferPayload)
    return
  }
}
