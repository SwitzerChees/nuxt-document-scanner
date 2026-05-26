/**
 * DocAligner Corner Detection Worker
 * Handles ONNX model inference for direct document corner detection
 * Runs off main thread for better performance
 */

import * as ort from 'onnxruntime-web/wasm'

declare const self: DedicatedWorkerGlobalScope

type InitPayload = {
  modelPath: string
  onnxPath: string
  modelResolution: number
  prefer: 'webgpu' | 'wasm'
  threads: number
  inputName: string
}

type InferPayload = {
  videoFrame: ImageData
}

let session: ort.InferenceSession | undefined
let actualExecutionProvider = 'unknown'
let isInitializing = false
let modelResolution = 256
let inputName = 'img'

const isIOSWebKit = () => {
  const ua = self.navigator?.userAgent || ''
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && 'ontouchend' in self)
  )
}

const disposeModel = async () => {
  const currentSession = session
  session = undefined
  isInitializing = false
  actualExecutionProvider = 'unknown'
  if (currentSession) {
    await currentSession.release().catch((error) => {
      console.warn('Failed to release ONNX session:', error)
    })
  }
}

const loadModel = async (payload: InitPayload): Promise<void> => {
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
    await disposeModel()
    isInitializing = true

    const isIOS = isIOSWebKit()
    const runtimeBasePath = onnxPath.endsWith('/') ? onnxPath : `${onnxPath}/`
    ort.env.wasm.wasmPaths = runtimeBasePath
    ort.env.wasm.numThreads = isIOS
      ? 1
      : self.crossOriginIsolated
        ? Math.max(1, threads || 1)
        : 1
    ort.env.wasm.initTimeout = 60000
    ort.env.wasm.simd = true
    ort.env.wasm.proxy = false

    const canUseWebGpu =
      prefer === 'webgpu' &&
      self.isSecureContext &&
      'gpu' in self.navigator
    const effectivePrefer = canUseWebGpu ? 'webgpu' : 'wasm'

    console.log('🔧 Initializing ONNX Runtime:', {
      prefer: effectivePrefer,
      threads: ort.env.wasm.numThreads,
      wasm: ort.env.wasm.numThreads === 1 ? 'simd' : 'simd-threaded',
      iOS: isIOS,
    })

    console.log('📥 Loading model from:', modelPath)
    const providerAttempts =
      effectivePrefer === 'wasm'
        ? [['wasm']]
        : [[effectivePrefer, 'wasm'], ['wasm']]

    let lastError: unknown
    for (const executionProviders of providerAttempts) {
      try {
        const sessionOptions: ort.InferenceSession.SessionOptions = {
          executionProviders,
          graphOptimizationLevel: 'all',
          executionMode: 'sequential',
          enableCpuMemArena: !isIOS,
          enableMemPattern: !isIOS,
          extra: isIOS
            ? {
                session: {
                  disable_prepacking: '1',
                },
              }
            : undefined,
        }
        session = await ort.InferenceSession.create(modelPath, sessionOptions)
        break
      } catch (error) {
        lastError = error
        console.warn('ONNX provider attempt failed:', executionProviders, error)
      }
    }

    if (!session) throw lastError

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

const preprocess = (videoFrame: ImageData) => {
  const w = videoFrame.width
  const h = videoFrame.height
  // DocAligner models require SQUARE input (typically 256x256)
  const target = modelResolution
  const tw = target
  const th = target

  // Calculate scale factors for width and height independently
  const scaleX = w / tw
  const scaleY = h / th

  // Convert to CHW format and normalize to [0, 1]
  const size = tw * th
  const data = new Float32Array(3 * size)
  const inv255 = 1 / 255

  for (let y = 0; y < th; y++) {
    const sy = Math.floor(y * scaleY)
    const rowOffset = sy * w

    for (let x = 0; x < tw; x++) {
      const sx = Math.floor(x * scaleX)
      const srcIdx = (rowOffset + sx) * 4
      const idx = y * tw + x

      // CHW format: all R, then all G, then all B
      data[idx] = (videoFrame.data[srcIdx] || 0) * inv255
      data[idx + size] = (videoFrame.data[srcIdx + 1] || 0) * inv255
      data[idx + (size << 1)] = (videoFrame.data[srcIdx + 2] || 0) * inv255
    }
  }

  return { data, tw, th, channels: 3, scaleX, scaleY }
}

type PostprocessPayload = {
  outputData: Float32Array
  outputShape: number[]
  imageWidth: number
  imageHeight: number
}

const postprocess = ({
  outputData,
  outputShape,
  imageWidth,
  imageHeight,
}: PostprocessPayload) => {
  if (outputShape.length !== 4) return undefined

  const [_, d2, d3, d4] = outputShape
  const isCHW = d2 === 4
  const numPoints = 4
  const [h, w] = isCHW ? [d3, d4] : [d2, d3]
  const heatmapSize = h! * w!
  const sx = imageWidth / w!
  const sy = imageHeight / h!
  const corners: number[] = [0, 0, 0, 0, 0, 0, 0, 0]

  for (let p = 0; p < numPoints; p++) {
    const off = p * heatmapSize
    let max = -Infinity,
      idx = 0
    for (let i = 0; i < heatmapSize; i++) {
      const v = outputData[off + i]
      if (v && v > max) {
        max = v
        idx = i
      }
    }
    corners[p * 2] = (idx % w!) * sx
    corners[p * 2 + 1] = Math.floor(idx / w!) * sy
  }

  return corners
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
    self.postMessage({
      type: 'corners',
      corners: undefined,
    })
    return
  }

  try {
    const { videoFrame } = payload as InferPayload
    if (!videoFrame || !videoFrame.data) {
      self.postMessage({
        type: 'corners',
        corners: undefined,
      })
      return
    }

    const pre = preprocess(videoFrame)

    const input = new ort.Tensor('float32', pre.data, [
      1,
      pre.channels,
      pre.th,
      pre.tw,
    ])

    const feeds: Record<string, ort.Tensor> = {}
    const name = inputName || session.inputNames?.[0] || 'img'
    feeds[name] = input

    const result = await session.run(feeds)

    const outputKey = Object.keys(result)[0]
    if (!outputKey) {
      self.postMessage({
        type: 'corners',
        corners: undefined,
        confidence: 0.0,
      })
      return
    }

    const outputTensor = result[outputKey]
    if (!outputTensor || !outputTensor.data) {
      self.postMessage({
        type: 'corners',
        corners: undefined,
        confidence: 0.0,
      })
      return
    }

    const outputData = outputTensor.data as Float32Array
    const outputShape = outputTensor.dims as number[]

    const postprocessPayload = {
      outputData,
      outputShape,
      imageWidth: videoFrame.width,
      imageHeight: videoFrame.height,
    }

    const corners = postprocess(postprocessPayload)

    self.postMessage({
      type: 'corners',
      corners,
    })
  } catch (error) {
    console.error('Worker inference error:', error)
    self.postMessage({
      type: 'corners',
      corners: undefined,
      error: error instanceof Error ? error.message : String(error),
    })
  }
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

  if (type === 'dispose') {
    await disposeModel()
    self.postMessage({ type: 'disposed' })
  }
}
