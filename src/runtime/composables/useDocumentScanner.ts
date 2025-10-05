/**
 * Main Document Scanner Composable
 * Coordinates ONNX worker for DocAligner corner detection
 */

import { ref, shallowRef, computed } from 'vue'
import { loadOpenCV } from '../utils/opencv-loader'
import { emaQuad, orderQuad, isValidRectangle } from '../utils/edge-detection'
import {
  grabRGBA,
  warpPerspective,
  imageDataToBase64,
  enhanceDocument,
} from '../utils/image-processing'
import { log, logError, logWarn } from '../utils/logging'

export interface ScannerOptions {
  modelPath: string
  opencvUrl: string
  preferExecutionProvider?: 'webgpu' | 'wasm'
  targetResolution?: number
  smoothingAlpha?: number
  threads?: number
  stabilityOptions?: {
    stableDuration?: number
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
  let stableStartTime = 0 // When stability started
  let debugFrameCounter = 0 // For debug logging
  const recentDeltas: number[] = [] // Track recent movements for smoothing
  const stabilityOptions = {
    stableDuration: options.stabilityOptions?.stableDuration || 1500, // ms
    motionThreshold: options.stabilityOptions?.motionThreshold || 8,
  }

  // Change detection for document switching
  let lastQuadArea = 0
  let lastQuadAspectRatio = 0
  const significantChangeThreshold = 0.3 // 30% change in area/aspect triggers reset

  // Device detection
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator?.userAgent || '')

  // Captured documents
  const documents = ref<CapturedDocument[]>([])

  /**
   * Initialize worker and OpenCV
   */
  async function initialize(): Promise<void> {
    if (isInitialized.value) {
      log('⚠️ Already initialized, cleaning up first...')
      await dispose()
      // Small delay to ensure cleanup is complete
      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    log('🔄 Initializing scanner...')
    log('  - Model path:', options.modelPath)
    log('  - Execution provider:', options.preferExecutionProvider || 'wasm')

    try {
      // Load OpenCV
      await loadOpenCV(options.opencvUrl)

      // Create and initialize worker
      log('👷 Creating DocAligner corner detection worker...')
      // const workerUrl = `?v=${Date.now()}`
      const w = new Worker(
        new URL('../workers/corner.worker.ts', import.meta.url),
        {
          type: 'module',
        },
      )
      window.addEventListener('beforeunload', () => w.terminate())

      // Listen for errors
      w.addEventListener('error', (e) => {
        logError('❌ Worker error:', e)
      })

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          logError('❌ Worker initialization timeout after 30s')
          reject(
            new Error('Worker init timeout - model file may not be accessible'),
          )
        }, 30000)

        const onReady = (e: MessageEvent) => {
          if (e.data.type === 'ready') {
            clearTimeout(timeout)
            w.removeEventListener('message', onReady)
            log('✅ ONNX Worker ready:', e.data.executionProvider)
            resolve()
          } else if (e.data.type === 'error') {
            clearTimeout(timeout)
            w.removeEventListener('message', onReady)
            logError('❌ Worker initialization error:', e.data.error)
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
            threads: options.threads || 1,
          },
        })
      })

      worker.value = w
      isInitialized.value = true
      options.onReady?.()
    } catch (error) {
      logError('❌ Failed to initialize scanner:', error)
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

      if (useTransferable) {
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
   * Process a single frame
   */
  async function processFrame(
    videoElement: HTMLVideoElement,
    returnHeatmaps = false,
  ): Promise<DetectionResult> {
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

    // Validate that corners form a proper rectangle before considering detection
    const isRectangle =
      corners && corners.length === 8
        ? isValidRectangle(corners, {
            minRectangularity: 0.8, // Stricter validation for better document detection
            maxAspectRatio: 2.5,
            minSideConsistency: 0.75,
            maxAngleDeviation: 25,
          })
        : false

    // Update detection stats - only consider as detected if it's a valid rectangle
    const quadDetected =
      !!corners && corners.length === 8 && confidence > 0.3 && isRectangle
    detectionStats.value = {
      quadDetected,
      confidence,
    }

    if (!corners || corners.length !== 8 || !isRectangle) {
      stableStartTime = 0
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
        stableStartTime = 0
        isStable.value = false
        recentDeltas.length = 0
        log('🔄 Resetting smoothing for new document')
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
      log('📊 Detection status:', {
        quadDetected,
        confidence: confidence.toFixed(3),
        hasSmoothed: !!smoothed,
        isValidRectangle: isRectangle,
        cornersFound: !!corners && corners.length === 8,
      })
    }

    // Check stability: compare current quad to previous quad (before updating)
    // Only check stability if we have a valid rectangle
    if (
      smoothed &&
      lastQuad.value &&
      quadDetected &&
      isValidRectangle(smoothed)
    ) {
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
        // Start timing stability if this is the first stable frame
        if (stableStartTime === 0) {
          stableStartTime = performance.now()
        }

        const stableDuration = performance.now() - stableStartTime
        const progressPercent = Math.min(
          (stableDuration / stabilityOptions.stableDuration) * 100,
          100,
        )

        // Debug: show progress towards stability (less frequent)
        if (
          Math.floor(stableDuration) % 500 === 0 &&
          !isStable.value &&
          stableDuration > 100
        ) {
          log('⏳ Approaching stability...', {
            progress: `${Math.round(progressPercent)}% (${Math.round(
              stableDuration,
            )}ms/${stabilityOptions.stableDuration}ms)`,
            avgDelta: avgDelta.toFixed(1),
            threshold: stabilityOptions.motionThreshold,
          })
        }

        if (stableDuration >= stabilityOptions.stableDuration) {
          if (!isStable.value) {
            log('🟢 Quad STABLE!', {
              avgDelta: avgDelta.toFixed(1),
              threshold: stabilityOptions.motionThreshold,
              duration: `${Math.round(stableDuration)}ms`,
            })
          }
          isStable.value = true
        }
      } else {
        if (isStable.value || stableStartTime > 0) {
          const wasStableFor =
            stableStartTime > 0 ? performance.now() - stableStartTime : 0
          // Only log if we had some stability progress
          if (wasStableFor > 100) {
            log('🔴 Movement detected', {
              avgDelta: avgDelta.toFixed(1),
              threshold: effectiveThreshold.toFixed(1),
              wasStableFor: `${Math.round(wasStableFor)}ms`,
            })
          }
        }
        // Reset stability if the current quad is no longer a valid rectangle
        stableStartTime = 0
        isStable.value = false
      }
    } else {
      stableStartTime = 0
      isStable.value = false
      recentDeltas.length = 0 // Clear history when quad is lost
    }

    // Update lastQuad AFTER stability check
    lastQuad.value = smoothed

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
      log('🔄 Significant quad change detected!', {
        areaChange: `${(areaChange * 100).toFixed(1)}%`,
        aspectChange: `${(aspectChange * 100).toFixed(1)}%`,
      })
      lastQuadArea = area
      lastQuadAspectRatio = aspectRatio
    }

    return significantChange
  }

  /**
   * Capture and warp document with high-resolution corner detection
   */
  async function captureDocument(
    original: ImageData,
    _realtimeQuad: number[],
    outputWidth = 1000,
  ): Promise<CapturedDocument | undefined> {
    log('📸 Starting high-resolution capture processing...')
    log('📐 Original image:', {
      size: `${original.width}x${original.height}`,
      pixels: original.width * original.height,
    })

    // Run DocAligner on the high-resolution image for precise corner detection
    log('🔍 Running corner detection on high-res image...')
    const inferStart = performance.now()
    const { corners: highResCorners, confidence } = await inferCorners(
      original,
      original.width,
      original.height,
      false, // Don't need heatmaps for capture
      false, // Don't use transferable objects - we need to reuse the ImageData for warping
    )
    const inferTime = performance.now() - inferStart

    log(`⚡ High-res inference completed in ${inferTime.toFixed(1)}ms`)
    log('📊 Detection result:', {
      detected: !!highResCorners,
      confidence: confidence.toFixed(3),
      corners: highResCorners,
    })

    // Use high-res corners if detected, otherwise fall back to realtime quad
    let finalQuad = highResCorners
    if (!finalQuad || finalQuad.length !== 8) {
      logWarn('⚠️ High-res detection failed, falling back to realtime quad')
      finalQuad = _realtimeQuad
    } else {
      log('✅ Using high-resolution detected corners')
    }

    // Order corners consistently
    const orderedQuad = orderQuad(finalQuad)
    if (!orderedQuad) {
      logError('❌ Failed to order quad corners')
      return undefined
    }

    log('🔄 Ordered corners:', orderedQuad)

    // Warp perspective to flatten document
    log('📐 Warping perspective...')
    const warped = warpPerspective(original, orderedQuad, outputWidth)
    if (!warped) {
      logError('❌ Failed to warp perspective')
      return undefined
    }

    log('✅ Warped document:', {
      size: `${warped.width}x${warped.height}`,
    })

    // Enhance document for better readability
    log('🎨 Enhancing document...')
    const enhanced = enhanceDocument(warped)

    log('✅ Document enhancement complete')

    const doc: CapturedDocument = {
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      original,
      warped: enhanced,
      quad: orderedQuad,
      timestamp: Date.now(),
      thumbnail: imageDataToBase64(enhanced, 'image/jpeg', 0.8),
    }

    documents.value.push(doc)
    log('✅ Document capture complete!')
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
      log('🧹 Requesting worker cleanup...')
      try {
        // Send cleanup message
        worker.value.postMessage({ type: 'cleanup' })

        // Wait briefly for cleanup to complete
        await new Promise((resolve) => setTimeout(resolve, 150))
      } catch (error) {
        logWarn('⚠️ Error during worker cleanup:', error)
      }

      // Terminate worker
      worker.value.terminate()
      worker.value = undefined
    }

    // Reset state
    isInitialized.value = false
    lastQuad.value = undefined
    isStable.value = false
    stableStartTime = 0
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
