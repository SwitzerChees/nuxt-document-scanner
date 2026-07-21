import * as ort from 'onnxruntime-web/wasm'
import {
  decodeCornerHeatmaps,
  preprocessDocAlignerInput,
} from '../utils/model-contract'

declare const self: DedicatedWorkerGlobalScope

type InitPayload = {
  modelPath: string
  onnxPath: string
  modelResolution: number
  prefer: 'webgpu' | 'wasm'
  inputName: string
}

type WorkerMessage = {
  type: 'init' | 'infer' | 'dispose'
  generation: number
  requestId?: number
  payload?: InitPayload | { videoFrame: ImageData }
}

let session: ort.InferenceSession | undefined
let actualExecutionProvider = 'unknown'
let modelResolution = 256
let inputName = 'img'
let activeGeneration = 0
let isInitializing = false
let isInferring = false

const isIOSWebKit = () => {
  const userAgent = self.navigator?.userAgent || ''
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (/Macintosh/.test(userAgent) && 'ontouchend' in self)
  )
}

const respond = (message: Record<string, unknown>) => {
  self.postMessage({ generation: activeGeneration, ...message })
}

const disposeModel = async () => {
  const currentSession = session
  session = undefined
  isInitializing = false
  isInferring = false
  actualExecutionProvider = 'unknown'
  if (currentSession) {
    await currentSession.release().catch((error) => {
      console.warn('Failed to release ONNX session:', error)
    })
  }
}

const loadModel = async (payload: InitPayload) => {
  if (isInitializing) throw new Error('Model initialization is already running.')
  modelResolution = payload.modelResolution
  inputName = payload.inputName
  isInitializing = true

  try {
    await disposeModel()
    isInitializing = true
    const isIOS = isIOSWebKit()
    ort.env.wasm.wasmPaths = payload.onnxPath.endsWith('/')
      ? payload.onnxPath
      : `${payload.onnxPath}/`
    // The package intentionally ships only the single-thread WASM variants.
    // This avoids imposing cross-origin isolation on every host application.
    ort.env.wasm.numThreads = 1
    ort.env.wasm.initTimeout = 60_000
    ort.env.wasm.simd = true
    ort.env.wasm.proxy = false

    if (payload.prefer === 'webgpu') {
      console.warn(
        'The wasm worker entry cannot provide WebGPU; using the measured WASM backend.',
      )
    }

    session = await ort.InferenceSession.create(payload.modelPath, {
      executionProviders: ['wasm'],
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
    })
    actualExecutionProvider = 'wasm'
  } finally {
    isInitializing = false
  }
}

const initialize = async (payload: InitPayload, generation: number) => {
  activeGeneration = generation
  try {
    await loadModel(payload)
    respond({ type: 'ready', executionProvider: actualExecutionProvider })
  } catch (error) {
    await disposeModel()
    respond({
      type: 'error',
      phase: 'initialization',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

const infer = async (
  payload: { videoFrame: ImageData },
  requestId: number,
  generation: number,
) => {
  if (generation !== activeGeneration) return
  if (!session) {
    respond({
      type: 'corners',
      requestId,
      detection: { confidence: 0, points: [] },
      error: 'Session is not initialized.',
    })
    return
  }
  if (isInferring) {
    respond({
      type: 'corners',
      requestId,
      detection: { confidence: 0, points: [] },
      error: 'Inference is already running.',
    })
    return
  }

  isInferring = true
  try {
    const { videoFrame } = payload
    if (!videoFrame?.data) throw new Error('Inference frame is missing.')
    const preprocessed = preprocessDocAlignerInput(
      videoFrame,
      modelResolution,
      modelResolution,
    )
    const name = inputName || session.inputNames?.[0] || 'img'
    const result = await session.run({
      [name]: new ort.Tensor(
        'float32',
        preprocessed.data,
        preprocessed.dims,
      ),
    })
    const outputKey = session.outputNames?.[0] || Object.keys(result)[0]
    const outputTensor = outputKey ? result[outputKey] : undefined
    if (!outputTensor?.data) throw new Error('Model returned no heatmap.')
    const detection = decodeCornerHeatmaps({
      outputData: outputTensor.data as Float32Array,
      outputShape: outputTensor.dims,
      imageWidth: videoFrame.width,
      imageHeight: videoFrame.height,
    })
    respond({ type: 'corners', requestId, detection })
  } catch (error) {
    respond({
      type: 'corners',
      requestId,
      detection: { confidence: 0, points: [] },
      error: error instanceof Error ? error.message : String(error),
    })
  } finally {
    isInferring = false
  }
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data
  if (message.type === 'init') {
    await initialize(message.payload as InitPayload, message.generation)
    return
  }
  if (message.generation !== activeGeneration) return
  if (message.type === 'infer') {
    await infer(
      message.payload as { videoFrame: ImageData },
      message.requestId ?? 0,
      message.generation,
    )
    return
  }
  if (message.type === 'dispose') {
    await disposeModel()
    respond({ type: 'disposed' })
  }
}
