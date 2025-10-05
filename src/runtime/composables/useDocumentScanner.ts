/**
 * Main Document Scanner Composable
 * Coordinates ONNX worker for DocAligner corner detection
 */

import { ref, shallowRef, computed } from 'vue'
import { loadOpenCV } from '../utils/opencv-loader'
import { emaQuad, orderQuad } from '../utils/edge-detection'
import {
  grabRGBA,
  warpPerspective,
  imageDataToBase64,
  enhanceDocument,
} from '../utils/image-processing'

export interface ScannerOptions {
  modelPath: string
  preferExecutionProvider?: 'webgpu' | 'wasm'
  targetResolution?: number
  smoothingAlpha?: number
  performanceOptions?: {
    targetFps?: number
    minFrameSkip?: number
    maxFrameSkip?: number
    stableFramesThreshold?: number
    useTransferableObjects?: boolean
  }
  stabilityOptions?: {
    stableFramesRequired?: number
    motionThreshold?: number
  }
  onReady?: () => void
  onError?: (error: Error) => void
}

export interface DetectionResult {
  quad: number[] | undefined
  quadSmoothed: number[] | undefined
  confidence: number
  quadDetected: boolean
  heatmaps?: ImageData[]
}

export interface CapturedDocument {
  id: string
  original: ImageData
  warped: ImageData | undefined
  quad: number[]
  timestamp: number
  thumbnail?: string
}

/**
 * Main document scanner composable
 */
export function useDocumentScanner(options: ScannerOptions) {
  // State
  const isInitialized = ref(false)
  const isRunning = ref(false)
  const worker = shallowRef<Worker>()
  const lastQuad = shallowRef<number[]>()
  const currentHeatmaps = shallowRef<ImageData[]>()

  // Stats
  const fps = ref(0)
  const inferenceTime = ref(0)
  const detectionStats = ref({
    quadDetected: false,
    confidence: 0,
  })

  // Stability tracking
  const isStable = ref(false)
  let stableFrameCounter = 0
  let debugFrameCounter = 0 // For debug logging
  const recentDeltas: number[] = [] // Track recent movements for smoothing
  const stabilityOptions = {
    stableFramesRequired: options.stabilityOptions?.stableFramesRequired || 30,
    motionThreshold: options.stabilityOptions?.motionThreshold || 8,
  }

  // Change detection for document switching
  let lastQuadArea = 0
  let lastQuadAspectRatio = 0
  const significantChangeThreshold = 0.3 // 30% change in area/aspect triggers reset

  // Device detection
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator?.userAgent || '')

  // Performance tracking
  const performanceOptions = {
    targetFps: options.performanceOptions?.targetFps || 30,
    minFrameSkip: options.performanceOptions?.minFrameSkip || 1,
    maxFrameSkip: options.performanceOptions?.maxFrameSkip || 6,
    stableFramesThreshold:
      options.performanceOptions?.stableFramesThreshold || 10,
    useTransferableObjects:
      options.performanceOptions?.useTransferableObjects ?? true,
  }

  let currentFrameSkip = performanceOptions.minFrameSkip
  let stableFrameCount = 0
  let averageProcessTime = 0
  const processTimes: number[] = []

  // Captured documents
  const documents = ref<CapturedDocument[]>([])

  /**
   * Initialize worker and OpenCV
   */
  async function initialize(): Promise<void> {
    if (isInitialized.value) {
      console.log('⚠️ Already initialized, cleaning up first...')
      await dispose()
      // Small delay to ensure cleanup is complete
      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    console.log('🔄 Initializing scanner...')
    console.log('  - Model path:', options.modelPath)
    console.log(
      '  - Execution provider:',
      options.preferExecutionProvider || 'wasm',
    )

    try {
      // Load OpenCV
      console.log('📦 Loading OpenCV...')
      await loadOpenCV()
      console.log('✅ OpenCV loaded')

      // Create and initialize worker
      console.log('👷 Creating DocAligner corner detection worker...')
      const w = new Worker(
        new URL('../workers/corner.worker.ts', import.meta.url),
        { type: 'module' },
      )

      // Listen for errors
      w.addEventListener('error', (e) => {
        console.error('❌ Worker error:', e)
      })

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.error('❌ Worker initialization timeout after 30s')
          reject(
            new Error('Worker init timeout - model file may not be accessible'),
          )
        }, 30000)

        const onReady = (e: MessageEvent) => {
          if (e.data.type === 'ready') {
            clearTimeout(timeout)
            w.removeEventListener('message', onReady)
            console.log('✅ ONNX Worker ready:', e.data.executionProvider)
            resolve()
          } else if (e.data.type === 'error') {
            clearTimeout(timeout)
            w.removeEventListener('message', onReady)
            console.error('❌ Worker initialization error:', e.data.error)
            reject(new Error(e.data.error))
          }
        }

        w.addEventListener('message', onReady)
        w.postMessage({
          type: 'init',
          payload: {
            modelPath: options.modelPath,
            prefer: options.preferExecutionProvider || 'wasm',
            isMobile: false, // Use same resolution for all devices now
          },
        })
      })

      worker.value = w
      isInitialized.value = true
      options.onReady?.()
    } catch (error) {
      console.error('❌ Failed to initialize scanner:', error)
      options.onError?.(error as Error)
      throw error
    }
  }

  /**
   * Request corner detection from worker
   */
  async function inferCorners(
    rgba: ImageData,
    width: number,
    height: number,
    returnHeatmaps = false,
    useTransferable = true,
  ): Promise<{
    corners: number[] | undefined
    confidence: number
    heatmaps?: ImageData[]
  }> {
    if (!worker.value)
      return { corners: undefined, confidence: 0, heatmaps: undefined }

    return new Promise((resolve) => {
      const onMessage = (e: MessageEvent) => {
        if (e.data.type === 'corners') {
          worker.value!.removeEventListener('message', onMessage)
          resolve({
            corners: e.data.corners as number[] | undefined,
            confidence: e.data.confidence as number,
            heatmaps: e.data.heatmaps as ImageData[] | undefined,
          })
        }
      }

      worker.value!.addEventListener('message', onMessage)

      const targetRes = options.targetResolution || 256

      // Use Transferable Objects if enabled and requested
      // Note: When using transferable objects, the ImageData buffer becomes detached
      // and cannot be reused. Disable for high-res capture where we need the buffer later.
      const payload = {
        rgba,
        w: width,
        h: height,
        targetRes,
        returnHeatmaps,
      }

      if (performanceOptions.useTransferableObjects && useTransferable) {
        // Transfer ownership of the ArrayBuffer to worker (zero-copy)
        worker.value!.postMessage({ type: 'infer', payload }, [
          rgba.data.buffer,
        ])
      } else {
        worker.value!.postMessage({ type: 'infer', payload })
      }
    })
  }

  /**
   * Calculate adaptive frame skip based on processing time and target FPS
   */
  function calculateFrameSkip(): number {
    const targetFrameTime = 1000 / performanceOptions.targetFps

    if (averageProcessTime === 0) {
      return performanceOptions.minFrameSkip
    }

    // Calculate how many frames we need to skip to hit target FPS
    const idealSkip = Math.floor(averageProcessTime / targetFrameTime)

    // Adjust based on detection state
    let adjustedSkip = idealSkip

    if (detectionStats.value.quadDetected) {
      stableFrameCount++

      // If quad is stable, we can skip more frames
      if (stableFrameCount > performanceOptions.stableFramesThreshold) {
        adjustedSkip = Math.max(adjustedSkip, performanceOptions.maxFrameSkip)
      }
    } else {
      stableFrameCount = 0
      // When searching, use minimum skip for responsiveness
      adjustedSkip = Math.max(adjustedSkip, performanceOptions.minFrameSkip)
    }

    // Clamp between min and max
    return Math.max(
      performanceOptions.minFrameSkip,
      Math.min(performanceOptions.maxFrameSkip, adjustedSkip),
    )
  }

  /**
   * Update processing time average (rolling window of last 10 frames)
   */
  function updateProcessTime(time: number): void {
    processTimes.push(time)
    if (processTimes.length > 10) {
      processTimes.shift()
    }
    averageProcessTime =
      processTimes.reduce((sum, t) => sum + t, 0) / processTimes.length
  }

  /**
   * Process a single frame
   */
  async function processFrame(
    videoElement: HTMLVideoElement,
    returnHeatmaps = false,
  ): Promise<DetectionResult> {
    const frameStart = performance.now()

    const rgba = grabRGBA(videoElement)
    if (!rgba) {
      return {
        quad: undefined,
        quadSmoothed: undefined,
        confidence: 0,
        quadDetected: false,
      }
    }

    const inferStart = performance.now()
    const { corners, confidence, heatmaps } = await inferCorners(
      rgba,
      rgba.width,
      rgba.height,
      returnHeatmaps,
    )
    inferenceTime.value = Math.round(performance.now() - inferStart)

    // Store heatmaps for visualization
    if (heatmaps) {
      currentHeatmaps.value = heatmaps
    }

    // Update detection stats
    const quadDetected = !!corners && corners.length === 8 && confidence > 0.3
    detectionStats.value = {
      quadDetected,
      confidence,
    }

    if (!corners || corners.length !== 8) {
      stableFrameCounter = 0
      isStable.value = false
      recentDeltas.length = 0

      return {
        quad: undefined,
        quadSmoothed: undefined,
        confidence: 0,
        quadDetected: false,
      }
    }

    // Order quad consistently BEFORE smoothing to prevent corner switching
    const orderedQuad = orderQuad(corners) || corners

    // Detect significant changes (document switch)
    let significantChange = false
    if (orderedQuad && quadDetected) {
      significantChange = detectSignificantChange(orderedQuad)

      // Reset smoothing on significant change for immediate pickup
      if (significantChange) {
        lastQuad.value = undefined
        stableFrameCounter = 0
        isStable.value = false
        recentDeltas.length = 0
        console.log('🔄 Resetting smoothing for new document')
      }
    }

    // Apply smoothing to prevent jitter
    const isNewDetection = !lastQuad.value && orderedQuad
    const adaptiveSmoothingAlpha = isNewDetection
      ? 0.6 // Faster initial pickup
      : 0.15 // Aggressive smoothing to prevent jitter

    const smoothed = emaQuad(
      lastQuad.value,
      orderedQuad,
      adaptiveSmoothingAlpha,
    )

    // Debug: show detection status every 30 frames
    debugFrameCounter++
    if (debugFrameCounter % 30 === 0) {
      console.log('📊 Detection status:', {
        quadDetected,
        confidence: confidence.toFixed(3),
        hasSmoothed: !!smoothed,
      })
    }

    // Check stability: compare current quad to previous quad (before updating)
    if (smoothed && lastQuad.value && quadDetected) {
      const maxDelta = calculateQuadMaxDelta(lastQuad.value, smoothed)

      // Track recent deltas with shorter window for faster response
      recentDeltas.push(maxDelta)
      if (recentDeltas.length > 5) {
        recentDeltas.shift()
      }

      // Use average delta over recent frames (more stable than single-frame spikes)
      const avgDelta =
        recentDeltas.reduce((sum, d) => sum + d, 0) / recentDeltas.length

      // Reduced hysteresis for faster state changes
      const effectiveThreshold = isStable.value
        ? stabilityOptions.motionThreshold * 1.25
        : stabilityOptions.motionThreshold

      if (avgDelta < effectiveThreshold) {
        stableFrameCounter++

        // Debug: show progress towards stability (less frequent)
        if (stableFrameCounter % 10 === 0 && !isStable.value) {
          console.log('⏳ Approaching stability...', {
            progress: `${stableFrameCounter}/${stabilityOptions.stableFramesRequired}`,
            avgDelta: avgDelta.toFixed(1),
            threshold: stabilityOptions.motionThreshold,
          })
        }

        if (stableFrameCounter >= stabilityOptions.stableFramesRequired) {
          if (!isStable.value) {
            console.log('🟢 Quad STABLE!', {
              avgDelta: avgDelta.toFixed(1),
              threshold: stabilityOptions.motionThreshold,
              frames: stableFrameCounter,
            })
          }
          isStable.value = true
        }
      } else {
        if (isStable.value || stableFrameCounter > 5) {
          // Only log if significant progress
          console.log('🔴 Movement detected', {
            avgDelta: avgDelta.toFixed(1),
            threshold: effectiveThreshold.toFixed(1),
            wasAtFrames: stableFrameCounter,
          })
        }
        stableFrameCounter = 0
        isStable.value = false
      }
    } else {
      stableFrameCounter = 0
      isStable.value = false
      recentDeltas.length = 0 // Clear history when quad is lost
    }

    // Update lastQuad AFTER stability check
    lastQuad.value = smoothed

    // Update performance metrics
    const totalTime = performance.now() - frameStart
    updateProcessTime(totalTime)
    currentFrameSkip = calculateFrameSkip()

    return {
      quad: orderedQuad,
      quadSmoothed: smoothed,
      confidence,
      quadDetected,
      heatmaps,
    }
  }

  /**
   * Calculate maximum delta between two quads
   */
  function calculateQuadMaxDelta(quad1: number[], quad2: number[]): number {
    let maxDelta = 0
    for (let i = 0; i < quad1.length; i++) {
      const delta = Math.abs((quad1[i] ?? 0) - (quad2[i] ?? 0))
      if (delta > maxDelta) maxDelta = delta
    }
    return maxDelta
  }

  /**
   * Calculate quad area (approximate)
   */
  function calculateQuadArea(quad: number[]): number {
    if (!quad || quad.length !== 8) return 0
    // Using shoelace formula for polygon area
    const x = [quad[0], quad[2], quad[4], quad[6]]
    const y = [quad[1], quad[3], quad[5], quad[7]]
    let area = 0
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4
      area += x[i]! * y[j]! - x[j]! * y[i]!
    }
    return Math.abs(area / 2)
  }

  /**
   * Calculate quad aspect ratio
   */
  function calculateQuadAspectRatio(quad: number[]): number {
    if (!quad || quad.length !== 8) return 0
    const width1 = Math.hypot(quad[2]! - quad[0]!, quad[3]! - quad[1]!)
    const width2 = Math.hypot(quad[4]! - quad[6]!, quad[5]! - quad[7]!)
    const height1 = Math.hypot(quad[6]! - quad[0]!, quad[7]! - quad[1]!)
    const height2 = Math.hypot(quad[4]! - quad[2]!, quad[5]! - quad[3]!)
    const avgWidth = (width1 + width2) / 2
    const avgHeight = (height1 + height2) / 2
    return avgWidth / Math.max(avgHeight, 1)
  }

  /**
   * Detect if there's a significant change in quad (document switch)
   */
  function detectSignificantChange(quad: number[]): boolean {
    if (!quad || quad.length !== 8) return false

    const area = calculateQuadArea(quad)
    const aspectRatio = calculateQuadAspectRatio(quad)

    // First detection
    if (lastQuadArea === 0 || lastQuadAspectRatio === 0) {
      lastQuadArea = area
      lastQuadAspectRatio = aspectRatio
      return false
    }

    // Check for significant changes
    const areaChange = Math.abs(area - lastQuadArea) / Math.max(lastQuadArea, 1)
    const aspectChange =
      Math.abs(aspectRatio - lastQuadAspectRatio) /
      Math.max(lastQuadAspectRatio, 0.1)

    const significantChange =
      areaChange > significantChangeThreshold ||
      aspectChange > significantChangeThreshold

    if (significantChange) {
      console.log('🔄 Significant quad change detected!', {
        areaChange: `${(areaChange * 100).toFixed(1)}%`,
        aspectChange: `${(aspectChange * 100).toFixed(1)}%`,
      })
      lastQuadArea = area
      lastQuadAspectRatio = aspectRatio
    }

    return significantChange
  }

  /**
   * Check if we should process this frame based on adaptive skip
   */
  function shouldProcessFrame(frameNumber: number): boolean {
    return frameNumber % (currentFrameSkip + 1) === 0
  }

  /**
   * Capture and warp document with high-resolution corner detection
   */
  async function captureDocument(
    original: ImageData,
    _realtimeQuad: number[],
    outputWidth = 1000,
  ): Promise<CapturedDocument | undefined> {
    console.log('📸 Starting high-resolution capture processing...')
    console.log('📐 Original image:', {
      size: `${original.width}x${original.height}`,
      pixels: original.width * original.height,
    })

    // Run DocAligner on the high-resolution image for precise corner detection
    console.log('🔍 Running corner detection on high-res image...')
    const inferStart = performance.now()
    const { corners: highResCorners, confidence } = await inferCorners(
      original,
      original.width,
      original.height,
      false, // Don't need heatmaps for capture
      false, // Don't use transferable objects - we need to reuse the ImageData for warping
    )
    const inferTime = performance.now() - inferStart

    console.log(`⚡ High-res inference completed in ${inferTime.toFixed(1)}ms`)
    console.log('📊 Detection result:', {
      detected: !!highResCorners,
      confidence: confidence.toFixed(3),
      corners: highResCorners,
    })

    // Use high-res corners if detected, otherwise fall back to realtime quad
    let finalQuad = highResCorners
    if (!finalQuad || finalQuad.length !== 8) {
      console.warn(
        '⚠️ High-res detection failed, falling back to realtime quad',
      )
      finalQuad = _realtimeQuad
    } else {
      console.log('✅ Using high-resolution detected corners')
    }

    // Order corners consistently
    const orderedQuad = orderQuad(finalQuad)
    if (!orderedQuad) {
      console.error('❌ Failed to order quad corners')
      return undefined
    }

    console.log('🔄 Ordered corners:', orderedQuad)

    // Warp perspective to flatten document
    console.log('📐 Warping perspective...')
    const warped = warpPerspective(original, orderedQuad, outputWidth)
    if (!warped) {
      console.error('❌ Failed to warp perspective')
      return undefined
    }

    console.log('✅ Warped document:', {
      size: `${warped.width}x${warped.height}`,
    })

    // Enhance document for better readability
    console.log('🎨 Enhancing document...')
    const enhanced = enhanceDocument(warped)

    console.log('✅ Document enhancement complete')

    const doc: CapturedDocument = {
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      original,
      warped: enhanced,
      quad: orderedQuad,
      timestamp: Date.now(),
      thumbnail: imageDataToBase64(enhanced, 'image/jpeg', 0.8),
    }

    documents.value.push(doc)
    console.log('✅ Document capture complete!')
    return doc
  }

  /**
   * Remove a captured document
   */
  function removeDocument(id: string): void {
    const index = documents.value.findIndex((doc) => doc.id === id)
    if (index !== -1) {
      documents.value.splice(index, 1)
    }
  }

  /**
   * Clear all captured documents
   */
  function clearDocuments(): void {
    documents.value = []
  }

  /**
   * Start scanning
   */
  function start(): void {
    isRunning.value = true
  }

  /**
   * Stop scanning
   */
  function stop(): void {
    isRunning.value = false
  }

  /**
   * Cleanup resources
   */
  async function dispose(): Promise<void> {
    stop()

    // Request cleanup from worker before terminating
    if (worker.value) {
      console.log('🧹 Requesting worker cleanup...')
      try {
        // Send cleanup message
        worker.value.postMessage({ type: 'cleanup' })

        // Wait briefly for cleanup to complete
        await new Promise((resolve) => setTimeout(resolve, 150))
      } catch (error) {
        console.warn('⚠️ Error during worker cleanup:', error)
      }

      // Terminate worker
      worker.value.terminate()
      worker.value = undefined
    }

    // Reset state
    isInitialized.value = false
    lastQuad.value = undefined
    isStable.value = false
    stableFrameCounter = 0
    recentDeltas.length = 0
  }

  // Cleanup on page unload
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      dispose()
    })
  }

  return {
    // State
    isInitialized,
    isRunning,
    isMobile,
    lastQuad: computed(() => lastQuad.value),
    currentHeatmaps: computed(() => currentHeatmaps.value),
    isStable: computed(() => isStable.value),

    // Stats
    fps,
    inferenceTime,
    detectionStats: computed(() => detectionStats.value),

    // Performance
    currentFrameSkip: computed(() => currentFrameSkip),
    averageProcessTime: computed(() => averageProcessTime),

    // Documents
    documents: computed(() => documents.value),

    // Methods
    initialize,
    processFrame,
    shouldProcessFrame,
    captureDocument,
    removeDocument,
    clearDocuments,
    start,
    stop,
    dispose,
  }
}
