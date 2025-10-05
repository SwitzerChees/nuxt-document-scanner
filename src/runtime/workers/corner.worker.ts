/**
 * DocAligner Corner Detection Worker
 * Handles ONNX model inference for direct document corner detection
 * Runs off main thread for better performance
 */

import * as ort from 'onnxruntime-web'

declare const self: DedicatedWorkerGlobalScope

interface InitPayload {
  modelPath: string
  prefer?: 'webgpu' | 'wasm'
  isMobile?: boolean
  threads?: number
}

interface InferPayload {
  rgba: ImageData
  w: number
  h: number
  targetRes?: number
  returnHeatmaps?: boolean // For debugging visualization
}

let session: ort.InferenceSession | undefined
let inputName: string | undefined
let inputChannels = 3
let isMobileDevice = false
let actualExecutionProvider = 'unknown'
let isInitializing = false
let modelType: 'point' | 'heatmap' = 'heatmap' // Default to heatmap

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
    ort.env.wasm.wasmPaths = '/onnx/'
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

    // Configure threading based on payload or default to 1
    const numThreads = payload.threads || 1
    ort.env.wasm.numThreads = numThreads

    console.log('🔧 Initializing ONNX Runtime:', {
      prefer,
      isMobile: isMobileDevice,
      threads: ort.env.wasm.numThreads,
      requestedThreads: numThreads,
    })

    const sessionOptions: ort.InferenceSession.SessionOptions = {
      executionProviders,
      graphOptimizationLevel: 'all',
      executionMode: isMobileDevice ? 'sequential' : 'parallel',
      enableCpuMemArena: !isMobileDevice, // Disable on mobile to reduce memory
      enableMemPattern: !isMobileDevice,
    }

    try {
      console.log('📥 Loading model from:', payload.modelPath)
      session = await ort.InferenceSession.create(
        payload.modelPath,
        sessionOptions,
      )

      // Log execution provider info
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
    } catch (err) {
      console.error('❌ Failed to load model from path:', payload.modelPath)
      console.error('Error details:', err)
      if (prefer === 'webgpu') {
        console.log('⚠️ WebGPU failed, falling back to WASM')

        const wasmOptions: ort.InferenceSession.SessionOptions = {
          executionProviders: ['wasm'],
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
    const channelDim = dims?.[1]
    const channels = typeof channelDim === 'number' ? channelDim : undefined

    if (channels === 1 || channels === 3) {
      inputChannels = channels
    }

    // Detect model type based on output shape
    const outputNames = session!.outputNames || []
    const outputMetadata = (session as any).outputMetadata || {}

    // Check first output
    if (outputNames.length > 0) {
      const firstOutputName = outputNames[0]
      if (firstOutputName) {
        const firstOutput = outputMetadata[firstOutputName]
        const outputDims = firstOutput?.dimensions as
          | (number | string | null | undefined)[]
          | undefined

        // Heatmap models typically output [batch, num_points, height, width] or [batch, height, width, num_points]
        // Point regression models output [batch, num_coords] where num_coords = 8 or [batch, 4, 2]
        if (outputDims && outputDims.length >= 3) {
          // Check if it's a heatmap (has spatial dimensions)
          const hasSpatialDims = outputDims
            .slice(-2)
            .every((d) => typeof d === 'number' && d > 8)
          modelType = hasSpatialDims ? 'heatmap' : 'point'
        } else {
          // Small output dimensions suggest point regression
          modelType = 'point'
        }
      }
    }

    // Also check model path for hints
    if (
      payload.modelPath.includes('_p_') ||
      payload.modelPath.includes('point')
    ) {
      modelType = 'point'
    } else if (
      payload.modelPath.includes('_h_') ||
      payload.modelPath.includes('heatmap')
    ) {
      modelType = 'heatmap'
    }
  } catch {
    // Use default
  }

  console.log('📊 Model info:', {
    inputName,
    inputChannels,
    modelType,
    executionProvider: actualExecutionProvider,
  })

  isInitializing = false
}

/**
 * Preprocess image for DocAligner model
 * Convert RGBA to RGB and resize to SQUARE target resolution (256x256 for DocAligner)
 * Note: DocAligner requires square input, so we resize to exact dimensions
 */
function preprocess(
  rgba: ImageData,
  w: number,
  h: number,
  targetRes?: number,
): {
  data: Float32Array
  tw: number
  th: number
  channels: number
  scaleX: number
  scaleY: number
} {
  // DocAligner models require SQUARE input (typically 256x256)
  const target = targetRes || 256
  const tw = target
  const th = target

  // Calculate scale factors for width and height independently
  const scaleX = w / tw
  const scaleY = h / th

  console.log('🖼️ Preprocessing:', {
    original: `${w}x${h}`,
    target: `${tw}x${th}`,
    scaleX: scaleX.toFixed(3),
    scaleY: scaleY.toFixed(3),
  })

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

/**
 * Postprocess point regression output
 * Output format: [batch, 8] or [batch, 4, 2] - 4 corners with x,y coordinates
 */
function postprocessPointRegression(
  output: Float32Array,
  imageWidth: number,
  imageHeight: number,
  _scaleX: number,
  _scaleY: number,
): number[] | undefined {
  // Expected output: 8 values (x1, y1, x2, y2, x3, y3, x4, y4) in normalized coordinates [0, 1]
  if (output.length < 8) {
    console.warn('Invalid point regression output length:', output.length)
    return undefined
  }

  // Convert normalized coordinates to pixel coordinates
  const corners: number[] = []
  for (let i = 0; i < 8; i += 2) {
    const x = output[i]! * imageWidth
    const y = output[i + 1]! * imageHeight
    corners.push(x, y)
  }

  return corners
}

/**
 * Postprocess heatmap output
 * Output format: [batch, 4, height, width] - heatmaps for 4 corners
 */
function postprocessHeatmap(
  output: Float32Array,
  outputShape: number[],
  imageWidth: number,
  imageHeight: number,
  _scaleX: number,
  _scaleY: number,
): {
  corners: number[] | undefined
  heatmapData?: Float32Array
  heatmapShape?: { width: number; height: number; numPoints: number }
} {
  // Parse output shape
  // Common formats: [1, 4, H, W] or [1, H, W, 4]
  let numPoints = 4
  let heatmapHeight = 0
  let heatmapWidth = 0

  if (outputShape.length === 4) {
    if (outputShape[1] === 4) {
      // [batch, num_points, height, width]
      numPoints = outputShape[1]
      heatmapHeight = outputShape[2]!
      heatmapWidth = outputShape[3]!
    } else if (outputShape[3] === 4) {
      // [batch, height, width, num_points]
      numPoints = outputShape[3]
      heatmapHeight = outputShape[1]!
      heatmapWidth = outputShape[2]!
    } else {
      // Default assumption: [1, 4, H, W]
      numPoints = outputShape[1]!
      heatmapHeight = outputShape[2]!
      heatmapWidth = outputShape[3]!
    }
  } else {
    console.warn('Unexpected heatmap output shape:', outputShape)
    return { corners: undefined }
  }

  console.log('📊 Heatmap shape:', {
    format: outputShape[1] === 4 ? '[B,C,H,W]' : '[B,H,W,C]',
    numPoints,
    height: heatmapHeight,
    width: heatmapWidth,
  })

  const corners: number[] = []
  const heatmapSize = heatmapHeight * heatmapWidth

  // Find peak for each corner heatmap
  for (let pointIdx = 0; pointIdx < numPoints; pointIdx++) {
    let maxVal = -Infinity
    let maxX = 0
    let maxY = 0

    // Get heatmap for this point
    const offset = pointIdx * heatmapSize

    for (let y = 0; y < heatmapHeight; y++) {
      for (let x = 0; x < heatmapWidth; x++) {
        const idx = offset + y * heatmapWidth + x
        const val = output[idx] || 0

        if (val > maxVal) {
          maxVal = val
          maxX = x
          maxY = y
        }
      }
    }

    // Convert heatmap coordinates to image coordinates
    // scaleX/scaleY are passed in - they account for original image -> 256x256 transformation
    const heatmapToInputScaleX = imageWidth / heatmapWidth
    const heatmapToInputScaleY = imageHeight / heatmapHeight

    const imgX = maxX * heatmapToInputScaleX
    const imgY = maxY * heatmapToInputScaleY

    console.log(`📍 Corner ${pointIdx}:`, {
      heatmapPos: `(${maxX}, ${maxY})`,
      imagePos: `(${imgX.toFixed(1)}, ${imgY.toFixed(1)})`,
      confidence: maxVal.toFixed(3),
    })

    corners.push(imgX, imgY)
  }

  return {
    corners: corners.length === 8 ? corners : undefined,
    heatmapData: output,
    heatmapShape: { width: heatmapWidth, height: heatmapHeight, numPoints },
  }
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
        modelType,
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

    const { rgba, w, h, targetRes, returnHeatmaps } = payload as InferPayload

    try {
      // Preprocess
      const pre = preprocess(rgba, w, h, targetRes)

      console.log('🔍 Inference input:', {
        originalSize: `${w}x${h}`,
        processedSize: `${pre.tw}x${pre.th}`,
        scaleX: pre.scaleX.toFixed(3),
        scaleY: pre.scaleY.toFixed(3),
        modelType,
      })

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

      const inferStart = performance.now()
      const result = await session.run(feeds)
      const inferTime = performance.now() - inferStart

      console.log(`⚡ Inference time: ${inferTime.toFixed(1)}ms`)

      // Get output
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
      const outputShape = outputTensor.dims as number[]

      console.log('📦 Model output shape:', outputShape)

      // Postprocess based on model type
      let corners: number[] | undefined
      let heatmaps: ImageData[] | undefined

      if (modelType === 'point') {
        corners = postprocessPointRegression(
          outputData,
          w,
          h,
          pre.scaleX,
          pre.scaleY,
        )
        console.log('✅ Point regression corners:', corners)
      } else {
        const heatmapResult = postprocessHeatmap(
          outputData,
          outputShape,
          w,
          h,
          pre.scaleX,
          pre.scaleY,
        )
        corners = heatmapResult.corners

        // Generate visualization heatmaps if requested
        if (
          returnHeatmaps &&
          heatmapResult.heatmapData &&
          heatmapResult.heatmapShape
        ) {
          heatmaps = generateHeatmapVisualizations(
            heatmapResult.heatmapData,
            heatmapResult.heatmapShape,
          )
        }

        console.log('✅ Heatmap corners:', corners)
      }

      // Send back to main thread
      self.postMessage({
        type: 'corners',
        corners,
        confidence: corners ? 1.0 : 0.0,
        heatmaps,
      })
    } catch (error) {
      console.error('❌ Inference error:', error)
      self.postMessage({
        type: 'corners',
        corners: undefined,
        confidence: 0.0,
      })
    }
  }
}

/**
 * Generate visualization ImageData for heatmaps
 */
function generateHeatmapVisualizations(
  heatmapData: Float32Array,
  shape: { width: number; height: number; numPoints: number },
): ImageData[] {
  const { width, height, numPoints } = shape
  const heatmaps: ImageData[] = []
  const heatmapSize = width * height

  for (let pointIdx = 0; pointIdx < numPoints; pointIdx++) {
    const offset = pointIdx * heatmapSize
    const imageData = new ImageData(width, height)

    // Find min/max for normalization
    let minVal = Infinity
    let maxVal = -Infinity
    for (let i = 0; i < heatmapSize; i++) {
      const val = heatmapData[offset + i] || 0
      if (val < minVal) minVal = val
      if (val > maxVal) maxVal = val
    }

    const range = maxVal - minVal || 1

    // Convert to RGB using color map (hot colormap)
    for (let i = 0; i < heatmapSize; i++) {
      const val = heatmapData[offset + i] || 0
      const normalized = (val - minVal) / range

      // Hot colormap: black -> red -> yellow -> white
      let r = 0
      let g = 0
      let b = 0

      if (normalized < 0.33) {
        // Black to red
        r = Math.round(normalized * 3 * 255)
      } else if (normalized < 0.66) {
        // Red to yellow
        r = 255
        g = Math.round((normalized - 0.33) * 3 * 255)
      } else {
        // Yellow to white
        r = 255
        g = 255
        b = Math.round((normalized - 0.66) * 3 * 255)
      }

      const idx = i * 4
      imageData.data[idx] = r
      imageData.data[idx + 1] = g
      imageData.data[idx + 2] = b
      imageData.data[idx + 3] = 255
    }

    heatmaps.push(imageData)
  }

  return heatmaps
}
