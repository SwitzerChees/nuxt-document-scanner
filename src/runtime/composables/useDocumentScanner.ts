/**
 * Main Document Scanner Composable
 * Coordinates ONNX worker, OpenCV, and detection logic
 */

import { ref, shallowRef, computed } from 'vue'
import { loadOpenCV } from '../utils/opencv-loader'
import {
  detectQuadWithHoughLines,
  emaQuad,
  orderQuad,
} from '../utils/edge-detection'
import {
  grabRGBA,
  warpPerspective,
  imageDataToBase64,
} from '../utils/image-processing'
import type { EdgeDetectionParams } from '../utils/edge-detection'

export interface ScannerOptions {
  modelPath: string
  preferExecutionProvider?: 'webgpu' | 'wasm'
  targetResolution?: number
  edgeThreshold?: number
  edgeDetectionParams?: EdgeDetectionParams
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
  edgeMap: ImageData | undefined
  stats: {
    horizontalLines: number
    verticalLines: number
    quadDetected: boolean
  }
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
  const currentEdgeMap = shallowRef<ImageData>()

  // Stats
  const fps = ref(0)
  const inferenceTime = ref(0)
  const detectionStats = ref({
    horizontalLines: 0,
    verticalLines: 0,
    quadDetected: false,
  })

  // Stability tracking
  const isStable = ref(false)
  let stableFrameCounter = 0
  const stabilityOptions = {
    stableFramesRequired: options.stabilityOptions?.stableFramesRequired || 30,
    motionThreshold: options.stabilityOptions?.motionThreshold || 8,
  }

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
      console.log('👷 Creating ONNX worker...')
      const w = new Worker(
        new URL('../workers/edge.worker.ts', import.meta.url),
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
   * Request edge detection from worker
   */
  async function inferEdges(
    rgba: ImageData,
    width: number,
    height: number,
  ): Promise<{ edge: ImageData | undefined; scale: number }> {
    if (!worker.value) return { edge: undefined, scale: 1 }

    return new Promise((resolve) => {
      const onMessage = (e: MessageEvent) => {
        if (e.data.type === 'edge') {
          worker.value!.removeEventListener('message', onMessage)
          resolve({
            edge: e.data.edge as ImageData,
            scale: e.data.scale as number,
          })
        }
      }

      worker.value!.addEventListener('message', onMessage)

      const targetRes = options.targetResolution || 192

      // Use Transferable Objects if enabled (zero-copy transfer)
      const payload = {
        rgba,
        w: width,
        h: height,
        threshold: options.edgeThreshold || 0.5,
        targetRes,
      }

      if (performanceOptions.useTransferableObjects) {
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
  ): Promise<DetectionResult> {
    const frameStart = performance.now()

    const rgba = grabRGBA(videoElement)
    if (!rgba) {
      return {
        quad: undefined,
        quadSmoothed: undefined,
        edgeMap: undefined,
        stats: { horizontalLines: 0, verticalLines: 0, quadDetected: false },
      }
    }

    const inferStart = performance.now()
    const { edge, scale } = await inferEdges(rgba, rgba.width, rgba.height)
    inferenceTime.value = Math.round(performance.now() - inferStart)

    if (!edge) {
      return {
        quad: undefined,
        quadSmoothed: undefined,
        edgeMap: undefined,
        stats: { horizontalLines: 0, verticalLines: 0, quadDetected: false },
      }
    }

    currentEdgeMap.value = edge

    // Detect quad using Hough Lines
    const { quad: rawQuad, stats } = detectQuadWithHoughLines(
      edge,
      options.edgeDetectionParams,
    )

    detectionStats.value = stats

    // Scale quad from edge resolution to video resolution
    const scaledQuad = rawQuad?.map((coord) => coord * scale)

    // Apply EMA smoothing
    const smoothed = emaQuad(
      lastQuad.value,
      scaledQuad,
      options.smoothingAlpha || 0.5,
    )

    // Check stability: compare current quad to previous quad (before updating)
    if (smoothed && lastQuad.value && stats.quadDetected) {
      const maxDelta = calculateQuadMaxDelta(lastQuad.value, smoothed)
      if (maxDelta < stabilityOptions.motionThreshold) {
        stableFrameCounter++
        if (stableFrameCounter >= stabilityOptions.stableFramesRequired) {
          isStable.value = true
        }
      } else {
        stableFrameCounter = 0
        isStable.value = false
      }
    } else {
      stableFrameCounter = 0
      isStable.value = false
    }

    // Update lastQuad AFTER stability check
    lastQuad.value = smoothed

    // Update performance metrics
    const totalTime = performance.now() - frameStart
    updateProcessTime(totalTime)
    currentFrameSkip = calculateFrameSkip()

    return {
      quad: scaledQuad,
      quadSmoothed: smoothed,
      edgeMap: edge,
      stats,
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
   * Check if we should process this frame based on adaptive skip
   */
  function shouldProcessFrame(frameNumber: number): boolean {
    return frameNumber % (currentFrameSkip + 1) === 0
  }

  /**
   * Capture and warp document
   */
  function captureDocument(
    original: ImageData,
    quad: number[],
    outputWidth = 1000,
  ): CapturedDocument | undefined {
    const warped = warpPerspective(original, quad, outputWidth)
    if (!warped) return undefined

    const doc: CapturedDocument = {
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      original,
      warped,
      quad: orderQuad(quad) || quad,
      timestamp: Date.now(),
      thumbnail: imageDataToBase64(warped, 'image/jpeg', 0.8),
    }

    documents.value.push(doc)
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
    currentEdgeMap.value = undefined
    isStable.value = false
    stableFrameCounter = 0
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
    currentEdgeMap: computed(() => currentEdgeMap.value),
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
