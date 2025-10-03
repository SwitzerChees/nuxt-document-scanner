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
  mobileResolution?: number
  edgeThreshold?: number
  edgeDetectionParams?: EdgeDetectionParams
  smoothingAlpha?: number
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

  // Device detection
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator?.userAgent || '')

  // Captured documents
  const documents = ref<CapturedDocument[]>([])

  /**
   * Initialize worker and OpenCV
   */
  async function initialize(): Promise<void> {
    if (isInitialized.value) return

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
            isMobile,
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

      const targetRes = isMobile
        ? options.mobileResolution || 256
        : options.targetResolution || 384

      worker.value!.postMessage({
        type: 'infer',
        payload: {
          rgba,
          w: width,
          h: height,
          threshold: options.edgeThreshold || 0.5,
          targetRes,
        },
      })
    })
  }

  /**
   * Process a single frame
   */
  async function processFrame(
    videoElement: HTMLVideoElement,
  ): Promise<DetectionResult> {
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
      options.smoothingAlpha || 0.3,
    )

    lastQuad.value = smoothed

    return {
      quad: scaledQuad,
      quadSmoothed: smoothed,
      edgeMap: edge,
      stats,
    }
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
  function dispose(): void {
    stop()
    worker.value?.terminate()
    worker.value = undefined
    isInitialized.value = false
  }

  return {
    // State
    isInitialized,
    isRunning,
    isMobile,
    lastQuad: computed(() => lastQuad.value),
    currentEdgeMap: computed(() => currentEdgeMap.value),

    // Stats
    fps,
    inferenceTime,
    detectionStats: computed(() => detectionStats.value),

    // Documents
    documents: computed(() => documents.value),

    // Methods
    initialize,
    processFrame,
    captureDocument,
    removeDocument,
    clearDocuments,
    start,
    stop,
    dispose,
  }
}
