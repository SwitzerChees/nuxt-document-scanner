/**
 * Main Document Scanner Composable
 * Coordinates ONNX worker, OpenCV, and detection logic
 */

import { ref, shallowRef, computed } from 'vue'
import { loadOpenCV, isOpenCVReady, getCV } from '../utils/opencv-loader'
import {
  detectQuadWithHoughLines,
  emaQuad,
  orderQuad,
} from '../utils/edge-detection'
import {
  grabRGBA,
  warpPerspectiveWithPadding,
  imageDataToBase64,
  enhanceDocument,
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
    let scaledQuad = rawQuad?.map((coord) => coord * scale)

    // Order quad consistently BEFORE smoothing to prevent corner switching
    if (scaledQuad) {
      scaledQuad = orderQuad(scaledQuad) || scaledQuad
    }

    // Detect significant changes (document switch)
    let significantChange = false
    if (scaledQuad && stats.quadDetected) {
      significantChange = detectSignificantChange(scaledQuad)

      // Reset smoothing on significant change for immediate pickup
      if (significantChange) {
        lastQuad.value = undefined
        stableFrameCounter = 0
        isStable.value = false
        recentDeltas.length = 0
        console.log('🔄 Resetting smoothing for new document')
      }
    }

    // Apply very aggressive smoothing to prevent jitter
    const isNewDetection = !lastQuad.value && scaledQuad
    const adaptiveSmoothingAlpha = isNewDetection
      ? 0.6 // Faster initial pickup
      : 0.15 // MUCH more aggressive smoothing (was 0.5)

    const smoothed = emaQuad(lastQuad.value, scaledQuad, adaptiveSmoothingAlpha)

    // Debug: show detection status every 30 frames
    debugFrameCounter++
    if (debugFrameCounter % 30 === 0) {
      console.log('📊 Detection status:', {
        quadDetected: stats.quadDetected,
        method: stats.method,
        confidence: stats.confidence?.toFixed(2),
        hasSmoothed: !!smoothed,
        hLines: stats.horizontalLines,
        vLines: stats.verticalLines,
      })
    }

    // Check stability: compare current quad to previous quad (before updating)
    if (smoothed && lastQuad.value && stats.quadDetected) {
      const maxDelta = calculateQuadMaxDelta(lastQuad.value, smoothed)

      // Track recent deltas with shorter window for faster response
      recentDeltas.push(maxDelta)
      if (recentDeltas.length > 5) {
        // Reduced from 10 to 5 for faster response
        recentDeltas.shift()
      }

      // Use average delta over recent frames (more stable than single-frame spikes)
      const avgDelta =
        recentDeltas.reduce((sum, d) => sum + d, 0) / recentDeltas.length

      // Reduced hysteresis for faster state changes
      const effectiveThreshold = isStable.value
        ? stabilityOptions.motionThreshold * 1.25 // Reduced from 1.5
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
   * Capture and warp document
   */
  async function captureDocument(
    original: ImageData,
    quad: number[],
    outputWidth = 1000,
  ): Promise<CapturedDocument | undefined> {
    // Warp perspective with padding for edge detection
    const paddingPercent = 0.15 // 15% padding around document
    const warpedWithPadding = warpPerspectiveWithPadding(
      original,
      quad,
      outputWidth,
      paddingPercent,
    )
    if (!warpedWithPadding) return undefined

    console.log('📐 Processing document:', {
      originalSize: `${original.width}x${original.height}`,
      warpedSize: `${warpedWithPadding.width}x${warpedWithPadding.height}`,
      padding: `${paddingPercent * 100}%`,
    })

    // Enhance document for better readability (detects edges, crops, and enhances)
    const enhanced = await enhanceDocumentWithPIDINet(warpedWithPadding)

    const doc: CapturedDocument = {
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      original,
      warped: enhanced,
      quad: orderQuad(quad) || quad,
      timestamp: Date.now(),
      thumbnail: imageDataToBase64(enhanced, 'image/jpeg', 0.8),
    }

    documents.value.push(doc)
    return doc
  }

  /**
   * Enhance document using PIDINet for accurate edge detection and cropping
   */
  async function enhanceDocumentWithPIDINet(
    warped: ImageData,
  ): Promise<ImageData> {
    if (!worker.value) {
      console.warn('Worker not available, using basic enhancement')
      return enhanceDocument(warped)
    }

    try {
      // Run PIDINet at higher resolution on the warped document
      const targetRes = 384 // Higher resolution for better edge detection (384 for speed)
      const inferenceStart = performance.now()

      console.log('🔍 Running PIDINet on warped document at', targetRes)

      const result = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.warn('⏱️ PIDINet timeout, falling back to basic enhancement')
          reject(new Error('Timeout'))
        }, 20000) // 20s timeout

        const handler = (e: MessageEvent) => {
          // Only handle 'edge' responses from the worker
          if (e.data?.type === 'edge') {
            clearTimeout(timeout)
            worker.value?.removeEventListener('message', handler)
            resolve(e.data)
          }
        }

        worker.value?.addEventListener('message', handler)

        // Clone ImageData to avoid transfer issues (OpenCV-created ImageData might not be transferable)
        const clonedData = new ImageData(
          new Uint8ClampedArray(warped.data),
          warped.width,
          warped.height,
        )

        console.log('📤 Sending to worker:', {
          size: `${clonedData.width}x${clonedData.height}`,
          targetRes,
        })

        // Send with correct format expected by worker
        const payload = {
          rgba: clonedData,
          w: clonedData.width,
          h: clonedData.height,
          threshold: options.edgeThreshold || 0.5,
          targetRes,
        }

        worker.value?.postMessage({ type: 'infer', payload })
      })

      console.log(
        `⚡ PIDINet inference completed: ${(
          performance.now() - inferenceStart
        ).toFixed(0)}ms`,
      )

      if (!result.edge) {
        console.warn('⚠️ No edge map returned, using basic enhancement')
        return enhanceDocument(warped)
      }

      // Detect document edges from PIDINet output
      const cropped = detectAndCropDocument(warped, result.edge)

      // Apply color enhancement
      const enhanced = enhanceDocument(cropped)

      console.log('✅ Document enhancement complete:', {
        input: `${warped.width}x${warped.height}`,
        output: `${enhanced.width}x${enhanced.height}`,
      })

      return enhanced
    } catch (error) {
      console.warn(
        '⚠️ PIDINet enhancement failed, using basic enhancement:',
        error,
      )
      return enhanceDocument(warped)
    }
  }

  /**
   * Detect document edges from PIDINet edge map and crop
   */
  function detectAndCropDocument(
    original: ImageData,
    edgeMap: ImageData,
  ): ImageData {
    if (!isOpenCVReady()) {
      console.warn('OpenCV not ready, skipping crop')
      return original
    }

    const cv = getCV()

    try {
      // Convert edge map to binary
      const edges = cv.matFromImageData(edgeMap)
      const binary = new cv.Mat()

      // If edge map is RGBA, convert to grayscale first
      if (edges.channels() === 4) {
        cv.cvtColor(edges, binary, cv.COLOR_RGBA2GRAY)
      } else {
        edges.copyTo(binary)
      }

      // Threshold to get clean binary edges (lower threshold for PIDINet output)
      cv.threshold(binary, binary, 50, 255, cv.THRESH_BINARY)

      // Apply morphological operations to clean up and connect edges
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))
      cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel) // Close gaps

      // Find contours
      const contours = new cv.MatVector()
      const hierarchy = new cv.Mat()
      cv.findContours(
        binary,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_SIMPLE,
      )

      // Find the largest contour that looks like a document
      // Since we have padding, the document should be clearly visible
      let bestRect: any = null
      let maxArea = original.width * original.height * 0.2 // Must be at least 20% of image

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)
        const area = cv.contourArea(contour)

        if (area > maxArea) {
          const rect = cv.boundingRect(contour)

          // Check if rect is reasonable (not too small, not full image)
          const margin = 10 // Allow small margin from edges
          const isNotFullImage =
            rect.x > margin ||
            rect.y > margin ||
            rect.width < original.width - 2 * margin ||
            rect.height < original.height - 2 * margin

          const isLargeEnough =
            rect.width > original.width * 0.4 &&
            rect.height > original.height * 0.4

          if (isNotFullImage && isLargeEnough) {
            maxArea = area
            bestRect = rect
          }
        }
      }

      // Crop if document edges detected
      const src = cv.matFromImageData(original)
      let result = src

      if (bestRect) {
        console.log('📐 PIDINet detected document edges, cropping:', {
          original: `${original.width}x${original.height}`,
          crop: `${bestRect.width}x${bestRect.height}`,
          position: `(${bestRect.x}, ${bestRect.y})`,
          reduction: `${(
            ((original.width * original.height -
              bestRect.width * bestRect.height) /
              (original.width * original.height)) *
            100
          ).toFixed(1)}%`,
        })

        const rect = new cv.Rect(
          bestRect.x,
          bestRect.y,
          bestRect.width,
          bestRect.height,
        )
        result = src.roi(rect)
      } else {
        console.log(
          '📐 No clear document edges found, keeping full warped image',
        )
      }

      // Convert back to ImageData
      const outputData = new Uint8ClampedArray(result.data)
      const cropped = new ImageData(outputData, result.cols, result.rows)

      // Cleanup
      edges.delete()
      binary.delete()
      kernel.delete()
      contours.delete()
      hierarchy.delete()
      src.delete()
      if (result !== src) result.delete()

      return cropped
    } catch (error) {
      console.error('Error detecting document edges:', error)
      return original
    }
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
