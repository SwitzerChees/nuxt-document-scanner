// @ts-ignore - web worker global
declare const self: DedicatedWorkerGlobalScope
import * as ort from 'onnxruntime-web'

type InitPayload = {
  modelPath: string
  prefer?: 'webgpu' | 'wasm'
  isMobile?: boolean
}

let session: ort.InferenceSession | undefined
let inputName: string | undefined
let inputChannels = 3
let isMobileDevice = false
let actualExecutionProvider = 'unknown'

const loadModel = async (payload: InitPayload) => {
  isMobileDevice = payload.isMobile || false

  // Performance optimizations for WASM
  // @ts-ignore
  ort.env.wasm.wasmPaths =
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/'
  // @ts-ignore
  ort.env.wasm.numThreads = Math.min(
    4,
    self.navigator?.hardwareConcurrency || 4,
  )
  // @ts-ignore
  ort.env.wasm.simd = true
  // @ts-ignore
  ort.env.wasm.proxy = false // Disable proxy for direct execution in worker

  const prefer = payload.prefer || 'wasm'
  const ep: any[] = []
  if (prefer === 'webgpu') {
    ep.push('webgpu')
  }
  ep.push('wasm')

  console.log('🔧 Initializing ONNX Runtime with:', {
    prefer,
    isMobile: isMobileDevice,
    threads: Math.min(4, self.navigator?.hardwareConcurrency || 4),
  })

  const options: ort.InferenceSession.SessionOptions = {
    executionProviders: ep,
    graphOptimizationLevel: 'all',
    executionMode: 'parallel',
    enableCpuMemArena: true,
    enableMemPattern: true,
  }

  try {
    session = await ort.InferenceSession.create(payload.modelPath, options)
    // Detect actual execution provider
    // @ts-ignore - internal ONNX property
    const backend =
      session?.handler?._inferenceHandler?._backend ||
      session?.handler?.backendType ||
      'unknown'
    actualExecutionProvider = String(backend)
    console.log('✅ Session created with backend:', actualExecutionProvider)
  } catch (err) {
    if (prefer === 'webgpu') {
      console.log('⚠️ WebGPU failed, falling back to WASM')
      // Fallback to WASM with same optimizations
      const wasmOptions: any = {
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

  // Resolve input name and expected channels if metadata provides it
  inputName = session!.inputNames?.[0] ?? 'input'
  try {
    // @ts-ignore
    const md = session!.inputMetadata?.[inputName]
    const dims = md?.dimensions as
      | (number | string | null | undefined)[]
      | undefined
    const ch = typeof dims?.[1] === 'number' ? (dims![1] as number) : undefined
    if (ch === 1 || ch === 3) inputChannels = ch
  } catch {}

  console.log('📊 Model info:', {
    inputName,
    inputChannels,
    executionProvider: actualExecutionProvider,
  })
}

const preprocess = (
  rgba: ImageData,
  w: number,
  h: number,
  targetRes?: number,
) => {
  // Use provided resolution or default based on device
  const target = targetRes || (isMobileDevice ? 256 : 384)
  const scale = Math.min(target / w, target / h)
  const tw = Math.round(w * scale)
  const th = Math.round(h * scale)
  const invScale = 1 / scale
  const inv255 = 1 / 255

  if (inputChannels === 1) {
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
        ch0[idx++] = (0.299 * r + 0.587 * g + 0.114 * b) * inv255
      }
    }
    return { data: ch0, tw, th, channels: 1 }
  } else {
    const size = tw * th
    const data = new Float32Array(3 * size)
    let idx = 0
    for (let y = 0; y < th; y++) {
      const sy = Math.floor(y * invScale)
      const rowOffset = sy * w
      for (let x = 0; x < tw; x++) {
        const sx = Math.floor(x * invScale)
        const i = (rowOffset + sx) << 2
        data[idx] = (rgba.data[i] || 0) * inv255
        data[idx + size] = (rgba.data[i + 1] || 0) * inv255
        data[idx + (size << 1)] = (rgba.data[i + 2] || 0) * inv255
        idx++
      }
    }
    return { data, tw, th, channels: 3 }
  }
}

const postprocess = (map: Float32Array, w: number, h: number, thr: number) => {
  const size = w * h
  const out = new Uint8ClampedArray(size * 4)
  let j = 0
  for (let i = 0; i < size; i++) {
    const v = (map[i] || 0) > thr ? 255 : 0
    out[j++] = v
    out[j++] = v
    out[j++] = v
    out[j++] = 255
  }
  return new ImageData(out, w, h)
}

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
    if (!session) return
    const { rgba, w, h, threshold, targetRes } = payload as {
      rgba: ImageData
      w: number
      h: number
      threshold?: number
      targetRes?: number
    }
    const pre = preprocess(rgba, w, h, targetRes)
    const input = new ort.Tensor('float32', pre.data, [
      1,
      pre.channels,
      pre.th,
      pre.tw,
    ])
    const feeds: Record<string, ort.Tensor> = {}
    // Use first input name dynamically for broader model compatibility
    const name = inputName || session.inputNames?.[0] || 'input'
    if (name) feeds[name] = input
    const res = await session.run(feeds)
    const key = Object.keys(res)[0]
    const logits = res[key].data as Float32Array
    const edge = postprocess(logits, pre.tw, pre.th, threshold || 0.05)
    self.postMessage({ type: 'edge', edge, scale: w / pre.tw })
  }
}
