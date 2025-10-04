/**
 * Edge Detection Worker
 * Handles ONNX model inference for edge detection
 * Runs off main thread for better performance
 */

import * as ort from 'onnxruntime-web'

declare const self: DedicatedWorkerGlobalScope

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
let isInitializing = false

/**
 * Cleanup existing session
 */
async function cleanup(): Promise<void> {
  if (session) {
    console.log('🧹 Cleaning up existing ONNX session...')
    try {
      await session.release()
    } catch (error) {
      console.warn('⚠️ Error releasing session:', error)
    }
    session = undefined
    inputName = undefined
    actualExecutionProvider = 'unknown'
  }
}

/**
 * Load and initialize ONNX model
 */
async function loadModel(payload: InitPayload): Promise<void> {
  // Prevent concurrent initialization
  if (isInitializing) {
    console.warn('⚠️ Already initializing, waiting...')
    return
  }

  isInitializing = true
  isMobileDevice = payload.isMobile || false

  // Clean up any existing session first
  await cleanup()

  // Add a small delay to ensure cleanup is complete
  await new Promise((resolve) => setTimeout(resolve, 100))

  try {
    // Configure WASM for mobile - lower memory usage
    ort.env.wasm.wasmPaths =
      'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/'
    ort.env.wasm.numThreads = isMobileDevice
      ? 1
      : Math.min(4, self.navigator?.hardwareConcurrency || 4)
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
      executionMode: isMobileDevice ? 'sequential' : 'parallel',
      enableCpuMemArena: !isMobileDevice, // Disable on mobile to reduce memory
      enableMemPattern: !isMobileDevice,
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
          executionProviders: ['wasm', 'webgpu'],
          graphOptimizationLevel: 'all',
          executionMode: isMobileDevice ? 'sequential' : 'parallel',
          enableCpuMemArena: !isMobileDevice,
          enableMemPattern: !isMobileDevice,
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
  } catch (error) {
    console.error('❌ Failed to load ONNX model:', error)
    isInitializing = false
    throw new Error(
      `Failed to initialize ONNX Runtime: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    )
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

  isInitializing = false
}

/**
 * Apply CLAHE-like local contrast enhancement
 */
function enhanceLocalContrast(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(data.length)
  const tileSize = 16 // Size of local region
  const clipLimit = 2.0 // Contrast limit

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4

      // Define local window
      const xStart = Math.max(0, x - tileSize)
      const xEnd = Math.min(w, x + tileSize)
      const yStart = Math.max(0, y - tileSize)
      const yEnd = Math.min(h, y + tileSize)

      // Calculate local histogram for luminance
      let minVal = 255
      let maxVal = 0

      for (let ty = yStart; ty < yEnd; ty++) {
        for (let tx = xStart; tx < xEnd; tx++) {
          const tidx = (ty * w + tx) * 4
          // Luminance
          const lum =
            0.299 * data[tidx]! +
            0.587 * data[tidx + 1]! +
            0.114 * data[tidx + 2]!
          minVal = Math.min(minVal, lum)
          maxVal = Math.max(maxVal, lum)
        }
      }

      // Apply contrast stretching
      const range = maxVal - minVal
      if (range > 10) {
        // Only enhance if there's sufficient local contrast
        const factor = Math.min(clipLimit, 255 / range)
        for (let c = 0; c < 3; c++) {
          const val = data[idx + c]!
          output[idx + c] = Math.min(
            255,
            Math.max(0, (val - minVal) * factor + minVal),
          )
        }
      } else {
        // Copy original if too flat
        output[idx] = data[idx]!
        output[idx + 1] = data[idx + 1]!
        output[idx + 2] = data[idx + 2]!
      }
      output[idx + 3] = 255 // Alpha
    }
  }

  return output
}

/**
 * Apply edge-preserving bilateral-like filter
 */
function bilateralFilter(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(data.length)
  const radius = 2
  const sigmaSpace = 2.0
  const sigmaColor = 50.0

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4

      let sumR = 0,
        sumG = 0,
        sumB = 0
      let sumWeight = 0

      const centerR = data[idx]!
      const centerG = data[idx + 1]!
      const centerB = data[idx + 2]!

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ny = y + dy
          const nx = x + dx

          if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
            const nidx = (ny * w + nx) * 4
            const nR = data[nidx]!
            const nG = data[nidx + 1]!
            const nB = data[nidx + 2]!

            // Spatial weight
            const spatialDist = dx * dx + dy * dy
            const spatialWeight = Math.exp(
              -spatialDist / (2 * sigmaSpace * sigmaSpace),
            )

            // Color weight
            const colorDist =
              (centerR - nR) ** 2 + (centerG - nG) ** 2 + (centerB - nB) ** 2
            const colorWeight = Math.exp(
              -colorDist / (2 * sigmaColor * sigmaColor),
            )

            const weight = spatialWeight * colorWeight

            sumR += nR * weight
            sumG += nG * weight
            sumB += nB * weight
            sumWeight += weight
          }
        }
      }

      output[idx] = sumWeight > 0 ? sumR / sumWeight : centerR
      output[idx + 1] = sumWeight > 0 ? sumG / sumWeight : centerG
      output[idx + 2] = sumWeight > 0 ? sumB / sumWeight : centerB
      output[idx + 3] = 255
    }
  }

  return output
}

/**
 * Apply unsharp masking for edge enhancement
 */
function unsharpMask(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  amount = 1.5,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(data.length)

  // Simple 3x3 Gaussian blur for unsharp mask
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1]
  const kernelSum = 16

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4

      for (let c = 0; c < 3; c++) {
        let sum = 0
        let ki = 0

        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const ny = Math.max(0, Math.min(h - 1, y + ky))
            const nx = Math.max(0, Math.min(w - 1, x + kx))
            const nidx = (ny * w + nx) * 4
            sum += data[nidx + c]! * kernel[ki]!
            ki++
          }
        }

        const blurred = sum / kernelSum
        const original = data[idx + c]!
        const sharpened = original + (original - blurred) * amount

        output[idx + c] = Math.max(0, Math.min(255, sharpened))
      }
      output[idx + 3] = 255
    }
  }

  return output
}

/**
 * Enhanced preprocessing pipeline
 */
function preprocessImage(
  rgba: ImageData,
  w: number,
  h: number,
  targetRes: number,
): ImageData {
  const target = targetRes || (isMobileDevice ? 256 : 384)
  const scale = Math.min(target / w, target / h)
  const tw = Math.round(w * scale)
  const th = Math.round(h * scale)

  // Step 1: Resize to target resolution
  const resized = new Uint8ClampedArray(tw * th * 4)
  const invScale = 1 / scale

  for (let y = 0; y < th; y++) {
    const sy = Math.floor(y * invScale)
    const rowOffset = sy * w

    for (let x = 0; x < tw; x++) {
      const sx = Math.floor(x * invScale)
      const srcIdx = (rowOffset + sx) * 4
      const dstIdx = (y * tw + x) * 4

      resized[dstIdx] = rgba.data[srcIdx]!
      resized[dstIdx + 1] = rgba.data[srcIdx + 1]!
      resized[dstIdx + 2] = rgba.data[srcIdx + 2]!
      resized[dstIdx + 3] = 255
    }
  }

  // Step 2: Apply bilateral filter to reduce noise while preserving edges
  const filtered = bilateralFilter(resized, tw, th)

  // Step 3: Enhance local contrast (CLAHE-like)
  const contrasted = enhanceLocalContrast(filtered, tw, th)

  // Step 4: Apply unsharp masking to enhance edges
  const sharpened = unsharpMask(contrasted, tw, th, 1.2)

  // Create ImageData from Uint8ClampedArray
  const imageData = new ImageData(tw, th)
  imageData.data.set(sharpened)
  return imageData
}

/**
 * Preprocess image for ONNX model
 * Convert preprocessed ImageData to model input format
 */
function preprocess(
  rgba: ImageData,
  w: number,
  h: number,
  targetRes?: number,
): { data: Float32Array; tw: number; th: number; channels: number } {
  // Apply image enhancement pipeline
  const enhanced = preprocessImage(
    rgba,
    w,
    h,
    targetRes || (isMobileDevice ? 256 : 384),
  )
  const tw = enhanced.width
  const th = enhanced.height
  const inv255 = 1 / 255

  if (inputChannels === 1) {
    // Grayscale input
    const ch0 = new Float32Array(tw * th)
    let idx = 0

    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const i = (y * tw + x) * 4
        const r = enhanced.data[i]!
        const g = enhanced.data[i + 1]!
        const b = enhanced.data[i + 2]!

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
      for (let x = 0; x < tw; x++) {
        const i = (y * tw + x) * 4

        // CHW format: all R, then all G, then all B
        data[idx] = (enhanced.data[i] || 0) * inv255
        data[idx + size] = (enhanced.data[i + 1] || 0) * inv255
        data[idx + (size << 1)] = (enhanced.data[i + 2] || 0) * inv255
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

  if (type === 'cleanup') {
    await cleanup()
    self.postMessage({ type: 'cleaned' })
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
