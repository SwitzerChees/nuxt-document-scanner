<template>
  <div class="min-h-screen bg-zinc-900 text-white p-4 flex gap-4 flex-col md:flex-row">
    <!-- Main Camera View -->
    <div class="flex-1 flex flex-col gap-4">
      <div class="relative w-full max-w-[500px] aspect-[210/297] mx-auto bg-black rounded-md overflow-hidden">
        <video ref="video" playsinline class="w-full h-full block object-cover" />
        <canvas ref="overlay" class="absolute inset-0 w-full h-full pointer-events-none"></canvas>
      </div>
      <div class="flex gap-2 justify-center flex-wrap">
        <button @click="toggle" class="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-semibold">
          {{ running ? 'Stop Camera' : 'Start Camera' }}
        </button>
        <button
          v-if="running"
          @click="manualCapture"
          :disabled="!debugInfo.quadDetected"
          class="px-6 py-3 bg-emerald-600 text-white rounded-md font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
          📸 Capture Page
        </button>
        <button @click="showDebug = !showDebug" class="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-md">
          {{ showDebug ? 'Hide Debug' : 'Show Debug' }}
        </button>
      </div>

      <!-- Captured Pages Counter -->
      <div v-if="pages.length > 0" class="text-center p-2 bg-emerald-600 rounded-md font-semibold">
        📄 {{ pages.length }} page{{ pages.length !== 1 ? 's' : '' }} captured
      </div>
    </div>

    <!-- Debug Panel -->
    <div v-if="showDebug" class="w-full md:w-[400px] flex flex-col gap-4 bg-zinc-800 p-4 rounded-md overflow-y-auto max-h-screen">
      <h2 class="m-0 text-xl">Debug Panel</h2>

      <!-- Edge Map Preview -->
      <div>
        <h3 class="mb-2 text-sm text-slate-400">Edge Detection Output</h3>
        <canvas ref="debugEdge" class="w-full border border-slate-700 rounded bg-black"></canvas>
        <div class="mt-2 text-sm text-slate-500">
          <div>Resolution: {{ debugInfo.edgeWidth }}×{{ debugInfo.edgeHeight }}</div>
          <div>Scale Factor: {{ debugInfo.scale.toFixed(2) }}</div>
        </div>
      </div>

      <!-- Parameters -->
      <div>
        <h3 class="mb-2 text-sm text-slate-400">Detection Parameters</h3>
        <div class="flex flex-col gap-3">
          <div>
            <label class="block text-sm mb-1">Edge Threshold: {{ edgeThreshold.toFixed(2) }}</label>
            <input type="range" v-model.number="edgeThreshold" min="0.01" max="0.8" step="0.01" class="w-full" />
          </div>
          <div>
            <label class="block text-sm mb-1">Binary Threshold: {{ binaryThreshold }}</label>
            <input type="range" v-model.number="binaryThreshold" min="10" max="100" step="5" class="w-full" />
          </div>
          <div>
            <label class="block text-sm mb-1">Min Area %: {{ (minAreaPercent * 100).toFixed(0) }}%</label>
            <input type="range" v-model.number="minAreaPercent" min="0.01" max="0.15" step="0.01" class="w-full" />
          </div>
          <div>
            <label class="block text-sm mb-1">Smoothing (Alpha): {{ smoothAlpha.toFixed(2) }}</label>
            <input type="range" v-model.number="smoothAlpha" min="0.1" max="0.8" step="0.05" class="w-full" />
          </div>
        </div>
      </div>

      <!-- Detection Stats -->
      <div>
        <h3 class="mb-2 text-sm text-slate-400">Performance</h3>
        <div class="text-sm text-slate-400 leading-6 mb-4">
          <div>
            FPS:
            <span
              :class="
                debugInfo.fps >= 25
                  ? 'text-emerald-500 font-bold'
                  : debugInfo.fps >= 15
                  ? 'text-amber-500 font-bold'
                  : 'text-red-500 font-bold'
              ">
              {{ debugInfo.fps }}
            </span>
          </div>
          <div>Frame Time: {{ debugInfo.totalMs }}ms</div>
          <div>Inference: {{ debugInfo.inferenceMs }}ms</div>
          <div>Device: {{ debugInfo.isMobile ? '📱 Mobile' : '🖥️ Desktop' }}</div>
          <div>Frame Skip: 1/{{ debugInfo.frameSkip }}</div>
          <div>Execution: {{ debugInfo.executionProvider }}</div>
          <div v-if="debugInfo.isMobile">
            Resolution: {{ debugInfo.targetResolution }}px
            <span v-if="debugInfo.targetResolution === 192">⚡</span>
            <span v-else-if="debugInfo.targetResolution === 384">🎯</span>
            <span v-else>⚖️</span>
          </div>
          <div v-if="debugInfo.isMobile">Motion: {{ debugInfo.isMoving ? '🔴 Moving' : '🟢 Stable' }}</div>
        </div>

        <h3 class="mb-2 text-sm text-slate-400">Detection Stats</h3>
        <div class="text-sm text-slate-400 leading-6">
          <div>Contours Found: {{ debugInfo.contoursFound }}</div>
          <div>Quads Found: {{ debugInfo.quadsFound }}</div>
          <div>Best Score: {{ debugInfo.bestScore.toFixed(3) }}</div>
          <div>
            Status:
            <span :style="{ color: debugInfo.quadDetected ? '#10b981' : '#ef4444' }">
              {{ debugInfo.quadDetected ? 'Detected' : 'Searching...' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Captured Pages Panel -->
    <div
      v-if="pages.length > 0 || showExportDialog"
      style="
        width: 350px;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        background: #111;
        padding: 1rem;
        border-radius: 0.5rem;
        overflow-y: auto;
        max-height: 100vh;
      ">
      <div style="display: flex; justify-content: space-between; align-items: center">
        <h2 style="margin: 0; font-size: 1.25rem">📄 Captured Pages</h2>
        <button
          v-if="!showExportDialog && pages.length > 0"
          @click="showExportDialog = true"
          style="
            padding: 0.5rem 1rem;
            background: #10b981;
            color: #fff;
            border: none;
            border-radius: 0.5rem;
            cursor: pointer;
            font-weight: 600;
          ">
          💾 Save PDF
        </button>
      </div>

      <!-- Export Dialog -->
      <div v-if="showExportDialog" style="background: #1a1a1a; padding: 1rem; border-radius: 0.5rem; border: 2px solid #10b981">
        <h3 style="margin: 0 0 1rem 0">Save as PDF</h3>
        <div style="display: flex; flex-direction: column; gap: 1rem">
          <div>
            <label style="display: block; font-size: 0.875rem; margin-bottom: 0.5rem">Document Name:</label>
            <input
              v-model="pdfFilename"
              type="text"
              placeholder="My Document"
              style="width: 100%; padding: 0.5rem; background: #374151; border: 1px solid #4b5563; border-radius: 0.375rem; color: #fff" />
          </div>
          <div>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer">
              <input type="checkbox" v-model="includeOCR" style="width: 1rem; height: 1rem" />
              <span style="font-size: 0.875rem">Include OCR (searchable text)</span>
            </label>
            <div v-if="!isOCRAvailable" style="font-size: 0.75rem; color: #9ca3af; margin-top: 0.25rem">
              ⚠️ OCR not available (PaddleOCR not integrated)
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem">
            <button
              @click="processingAndExport"
              :disabled="isProcessing"
              style="
                flex: 1;
                padding: 0.75rem;
                background: #10b981;
                color: #fff;
                border: none;
                border-radius: 0.5rem;
                cursor: pointer;
                font-weight: 600;
                opacity: 1;
              "
              :style="{ opacity: isProcessing ? 0.5 : 1, cursor: isProcessing ? 'not-allowed' : 'pointer' }">
              {{ isProcessing ? '⏳ Processing...' : '💾 Save' }}
            </button>
            <button
              @click="showExportDialog = false"
              :disabled="isProcessing"
              style="padding: 0.75rem 1rem; background: #374151; color: #fff; border: none; border-radius: 0.5rem; cursor: pointer">
              Cancel
            </button>
          </div>
        </div>
      </div>

      <!-- Processing Progress -->
      <div v-if="isProcessing" style="background: #1a1a1a; padding: 1rem; border-radius: 0.5rem">
        <div style="font-size: 0.875rem; margin-bottom: 0.5rem">Processing pages...</div>
        <div style="background: #374151; height: 0.5rem; border-radius: 0.25rem; overflow: hidden">
          <div
            style="background: #10b981; height: 100%; transition: width 0.3s"
            :style="{ width: `${(processedPages / pages.length) * 100}%` }"></div>
        </div>
        <div style="font-size: 0.75rem; color: #9ca3af; margin-top: 0.25rem">{{ processedPages }} / {{ pages.length }} pages</div>
      </div>

      <!-- Page List -->
      <div style="display: flex; flex-direction: column; gap: 0.75rem">
        <div
          v-for="(page, index) in pages"
          :key="page.id"
          style="
            background: #1a1a1a;
            padding: 0.75rem;
            border-radius: 0.5rem;
            display: flex;
            gap: 0.75rem;
            align-items: flex-start;
            border: 1px solid #374151;
          ">
          <div style="flex-shrink: 0; width: 80px; height: 100px; background: #000; border-radius: 0.25rem; overflow: hidden">
            <canvas :ref="(el) => setPageCanvas(page.id, el)" style="width: 100%; height: 100%; object-fit: contain"></canvas>
          </div>
          <div style="flex: 1; min-width: 0">
            <div style="font-weight: 600; margin-bottom: 0.25rem">Page {{ index + 1 }}</div>
            <div style="font-size: 0.75rem; color: #9ca3af">
              {{ new Date(page.timestamp).toLocaleTimeString() }}
            </div>
            <div v-if="page.ocrProgress !== undefined" style="font-size: 0.75rem; color: #10b981; margin-top: 0.25rem">
              OCR: {{ Math.round(page.ocrProgress * 100) }}%
            </div>
          </div>
          <button
            @click="removePage(page.id)"
            :disabled="isProcessing"
            style="
              padding: 0.375rem;
              background: #ef4444;
              color: #fff;
              border: none;
              border-radius: 0.25rem;
              cursor: pointer;
              font-size: 0.875rem;
            ">
            🗑️
          </button>
        </div>
      </div>

      <button
        v-if="!showExportDialog && pages.length > 0"
        @click="clearAllPages"
        :disabled="isProcessing"
        style="padding: 0.75rem; background: #ef4444; color: #fff; border: none; border-radius: 0.5rem; cursor: pointer">
        Clear All Pages
      </button>
    </div>

    <!-- Crop Editor Modal -->
    <CropEditor
      :show="showCropEditor"
      :imageData="pendingCaptureImage"
      :quad="pendingCaptureQuad"
      @confirm="onCropConfirm"
      @cancel="onCropCancel" />
  </div>
</template>

<script setup lang="ts">
  import { useCamera } from '../composables/useCamera'
  import { useCapturedPages } from '../composables/useCapturedPages'
  import { biggestQuad, emaQuad, warpPerspective, setDetectionParams } from '../utils/quad'
  import { flattenImage, createThumbnail, convertToBlackAndWhite } from '../utils/imageProcessing'
  import { generatePDF, downloadPDF } from '../utils/pdfGenerator'
  import { initOCR, performOCR, isOCRAvailable as checkOCRAvailable } from '../utils/ocr'
  import CropEditor from '../components/CropEditor.vue'

  const video = ref<HTMLVideoElement>()
  const overlay = ref<HTMLCanvasElement>()
  const result = ref<HTMLCanvasElement>()
  const debugEdge = ref<HTMLCanvasElement>()

  const { start, stop, switchResolution } = useCamera()
  const { pages, isProcessing, addPage, removePage: removePageFromState, clearPages, updatePageOCR } = useCapturedPages()

  let worker: Worker | undefined
  const running = ref(false)
  let lastQuad: number[] | undefined // Display coordinates for drawing
  let lastQuadVideo: number[] | undefined // Video resolution coordinates for cropping
  const captured = ref(false)
  const showDebug = ref(false)
  const showExportDialog = ref(false)
  const showCropEditor = ref(false)
  const pdfFilename = ref('Document')
  const includeOCR = ref(false)
  const processedPages = ref(0)
  const isOCRAvailable = ref(false)
  const pageCanvases = new Map<string, HTMLCanvasElement>()

  // Crop editor state
  const pendingCaptureImage = ref<ImageData | null>(null)
  const pendingCaptureQuad = ref<number[] | null>(null)

  // Tunable parameters
  const edgeThreshold = ref(0.5)
  const binaryThreshold = ref(30)
  const minAreaPercent = ref(0.03)
  const smoothAlpha = ref(0.3)

  const debugInfo = ref({
    edgeWidth: 0,
    edgeHeight: 0,
    scale: 1,
    contoursFound: 0,
    quadsFound: 0,
    bestScore: 0,
    quadDetected: false,
    fps: 0,
    inferenceMs: 0,
    totalMs: 0,
    executionProvider: 'unknown',
    isMobile: false,
    frameSkip: 1,
    isMoving: false,
    targetResolution: 384,
  })

  let frameCount = 0
  let lastFpsUpdate = performance.now()
  let lastFrameTime = performance.now()
  let frameSkipCounter = 0
  let lastFrameImageData: ImageData | null = null
  let consecutiveStableFrames = 0

  // Detect mobile device
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator?.userAgent || '')
  debugInfo.value.isMobile = isMobile

  // Adaptive frame skip based on device
  const getFrameSkipRate = () => {
    if (!isMobile) return 1 // Desktop: process every frame
    // Mobile: adaptive based on detection state
    return debugInfo.value.quadDetected ? 3 : 2 // Skip more when stable
  }

  // Simple motion detection by comparing frames (very fast, ~0.5ms)
  const hasSignificantMotion = (currentFrame: ImageData): boolean => {
    if (!isMobile) return false // Only use on mobile
    if (!lastFrameImageData || lastFrameImageData.width !== currentFrame.width) {
      // First frame or size change - store it
      lastFrameImageData = new ImageData(new Uint8ClampedArray(currentFrame.data), currentFrame.width, currentFrame.height)
      return true // Assume motion on first frame
    }

    // Sample every 16th pixel for ultra-fast comparison
    let totalDiff = 0
    const data1 = lastFrameImageData.data
    const data2 = currentFrame.data
    const step = 64 // Sample every 16 pixels (4 channels * 16)
    let samples = 0

    for (let i = 0; i < data1.length; i += step) {
      totalDiff += Math.abs(data1[i] - data2[i]) // Just red channel is enough
      samples++
    }

    const avgDiff = totalDiff / samples

    // Update stored frame
    lastFrameImageData.data.set(currentFrame.data)

    // If average pixel difference > 8, consider it motion
    return avgDiff > 8
  }

  const drawQuad = (ctx: CanvasRenderingContext2D, q: number[] | undefined) => {
    if (!q) return
    const [x0, y0, x1, y1, x2, y2, x3, y3] = q

    if (isNaN(x0) || isNaN(y0) || isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2) || isNaN(x3) || isNaN(y3)) {
      return
    }

    ctx.lineWidth = 4
    ctx.strokeStyle = '#00ff88'
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
    ctx.shadowBlur = 4
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.lineTo(x3, y3)
    ctx.closePath()
    ctx.stroke()
    ctx.shadowBlur = 0

    ctx.fillStyle = '#00ff88'
    const drawCorner = (x: number, y: number) => {
      ctx.beginPath()
      ctx.arc(x, y, 6, 0, 2 * Math.PI)
      ctx.fill()
    }
    drawCorner(x0, y0)
    drawCorner(x1, y1)
    drawCorner(x2, y2)
    drawCorner(x3, y3)
  }

  const grabRGBA = (v: HTMLVideoElement) => {
    const c = document.createElement('canvas')
    if (!v.videoWidth || !v.videoHeight) return undefined
    c.width = v.videoWidth
    c.height = v.videoHeight
    const ctx = c.getContext('2d')
    if (!ctx) return undefined
    try {
      ctx.drawImage(v, 0, 0, c.width, c.height)
      return ctx.getImageData(0, 0, c.width, c.height)
    } catch {
      return undefined
    }
  }

  const ensureWorker = async () => {
    if (worker) return worker
    worker = new Worker(new URL('~/workers/edge.worker.ts', import.meta.url), { type: 'module' })

    return new Promise<Worker>((resolve, reject) => {
      const onReady = (e: MessageEvent) => {
        if (e.data.type === 'ready') {
          worker!.removeEventListener('message', onReady)
          // Get execution provider info from worker
          if (e.data.executionProvider) {
            debugInfo.value.executionProvider = e.data.executionProvider
            console.log('✅ ONNX Execution Provider:', e.data.executionProvider)
          }
          resolve(worker!)
        }
      }
      worker!.addEventListener('message', onReady)
      // Pass mobile flag to worker for resolution optimization
      worker!.postMessage({
        type: 'init',
        payload: {
          modelPath: '/models/pidinet_tiny.onnx',
          prefer: 'webgpu',
          isMobile,
        },
      })
      setTimeout(() => reject(new Error('Worker init timeout')), 30_000)
    })
  }

  const requestEdge = (rgba: ImageData, w: number, h: number, threshold: number, targetRes?: number) => {
    if (!worker) return Promise.resolve<{ edge: ImageData | undefined; scale: number }>({ edge: undefined, scale: 1 })
    return new Promise((res) => {
      const onMsg = (e: MessageEvent) => {
        if (e.data.type === 'edge') {
          worker!.removeEventListener('message', onMsg)
          res({ edge: e.data.edge as ImageData, scale: e.data.scale as number })
        }
      }
      worker.addEventListener('message', onMsg)
      worker.postMessage({ type: 'infer', payload: { rgba, w, h, threshold, targetRes } })
    })
  }

  const loop = async () => {
    if (!running.value || !video.value || !overlay.value) return
    const frameStart = performance.now()

    const rgba = grabRGBA(video.value)
    if (!rgba) return requestAnimationFrame(loop)

    // Check for motion (very fast check, ~0.5ms)
    const isMoving = hasSignificantMotion(rgba)

    // Adaptive frame skipping for mobile performance
    const skipRate = getFrameSkipRate()
    debugInfo.value.frameSkip = skipRate

    // Extra skipping if moving (skip 3 more frames)
    const motionSkipMultiplier = isMoving ? 4 : 1
    const shouldProcess = frameSkipCounter % (skipRate * motionSkipMultiplier) === 0
    frameSkipCounter++

    const displayWidth = video.value.clientWidth
    const displayHeight = video.value.clientHeight

    if (overlay.value.width !== displayWidth || overlay.value.height !== displayHeight) {
      overlay.value.width = displayWidth
      overlay.value.height = displayHeight
    }

    const ctx = overlay.value.getContext('2d')
    if (!ctx) return requestAnimationFrame(loop)

    const videoWidth = rgba.width
    const videoHeight = rgba.height

    const scaleX = displayWidth / videoWidth
    const scaleY = displayHeight / videoHeight
    const displayScale = Math.max(scaleX, scaleY)

    const scaledVideoWidth = videoWidth * displayScale
    const scaledVideoHeight = videoHeight * displayScale
    const offsetX = (displayWidth - scaledVideoWidth) / 2
    const offsetY = (displayHeight - scaledVideoHeight) / 2

    // Skip expensive inference if not needed
    if (!shouldProcess) {
      // Just redraw the last smoothed quad (no inference, no OpenCV)
      const ctx = overlay.value.getContext('2d')
      if (ctx && lastQuad) {
        ctx.clearRect(0, 0, displayWidth, displayHeight)
        drawQuad(ctx, lastQuad)
      }

      // Update FPS counter
      frameCount++
      const now = performance.now()
      if (now - lastFpsUpdate >= 1000) {
        debugInfo.value.fps = Math.round((frameCount * 1000) / (now - lastFpsUpdate))
        frameCount = 0
        lastFpsUpdate = now
      }

      return requestAnimationFrame(loop)
    }

    const wkr = await ensureWorker()
    if (!wkr) return requestAnimationFrame(loop)

    // Progressive quality: use lower resolution initially on mobile, upgrade when stable
    let targetResolution = isMobile ? 256 : 384
    if (isMobile && debugInfo.value.quadDetected) {
      // Upgrade resolution after consecutive stable detections
      consecutiveStableFrames++
      if (consecutiveStableFrames > 20) {
        targetResolution = 384 // Full quality after ~2-3 seconds stable
      } else if (consecutiveStableFrames > 10) {
        targetResolution = 320 // Medium quality after ~1 second
      }
    } else if (isMobile) {
      consecutiveStableFrames = 0 // Reset if no detection
      targetResolution = 192 // Start with fastest for initial search
    }

    debugInfo.value.targetResolution = targetResolution
    debugInfo.value.isMoving = isMoving

    const inferStart = performance.now()
    let edgeResult: { edge: ImageData | undefined; scale: number }
    try {
      edgeResult = await requestEdge(rgba, videoWidth, videoHeight, edgeThreshold.value, targetResolution)
    } catch (e) {
      console.warn('edge worker error', e)
      edgeResult = { edge: undefined, scale: 1 }
    }
    const inferEnd = performance.now()
    debugInfo.value.inferenceMs = Math.round(inferEnd - inferStart)

    // Update debug edge preview
    if (edgeResult.edge && debugEdge.value) {
      debugEdge.value.width = edgeResult.edge.width
      debugEdge.value.height = edgeResult.edge.height
      const debugCtx = debugEdge.value.getContext('2d')
      if (debugCtx) {
        debugCtx.putImageData(edgeResult.edge, 0, 0)
      }
    }

    debugInfo.value.edgeWidth = edgeResult.edge?.width || 0
    debugInfo.value.edgeHeight = edgeResult.edge?.height || 0
    debugInfo.value.scale = edgeResult.scale

    // Update detection parameters
    setDetectionParams({
      binaryThreshold: binaryThreshold.value,
      minAreaPercent: minAreaPercent.value,
    })

    let quadRaw: number[] | undefined
    let quadVideo: number[] | undefined
    let detectionStats = { contoursFound: 0, quadsFound: 0, bestScore: 0 }
    try {
      const result = edgeResult.edge ? biggestQuad(edgeResult.edge) : { quad: undefined, stats: detectionStats }
      quadRaw = result.quad
      detectionStats = result.stats

      if (quadRaw) {
        // First, scale from edge map resolution to video resolution
        quadVideo = quadRaw.map((coord) => coord * edgeResult.scale)

        // Then, scale from video resolution to display coordinates for drawing
        quadRaw = quadRaw.map((coord, idx) => {
          const videoCoord = coord * edgeResult.scale
          if (idx % 2 === 0) {
            return videoCoord * displayScale + offsetX
          } else {
            return videoCoord * displayScale + offsetY
          }
        })
      }
    } catch (e) {
      console.warn('opencv error', e)
      quadRaw = undefined
      quadVideo = undefined
    }

    debugInfo.value.contoursFound = detectionStats.contoursFound
    debugInfo.value.quadsFound = detectionStats.quadsFound
    debugInfo.value.bestScore = detectionStats.bestScore
    debugInfo.value.quadDetected = !!quadRaw

    // Smooth both display and video quads
    const quad = emaQuad(lastQuad, quadRaw, smoothAlpha.value)
    const quadVideoSmoothed = emaQuad(lastQuadVideo, quadVideo, smoothAlpha.value)
    lastQuad = quad
    lastQuadVideo = quadVideoSmoothed
    ctx.clearRect(0, 0, displayWidth, displayHeight)

    drawQuad(ctx, quad)

    // Update performance stats
    const frameEnd = performance.now()
    debugInfo.value.totalMs = Math.round(frameEnd - frameStart)

    frameCount++
    if (frameEnd - lastFpsUpdate >= 1000) {
      debugInfo.value.fps = Math.round((frameCount * 1000) / (frameEnd - lastFpsUpdate))
      frameCount = 0
      lastFpsUpdate = frameEnd
    }

    requestAnimationFrame(loop)
  }

  const toggle = async () => {
    if (!running.value) {
      await start(video.value!)
      running.value = true
      requestAnimationFrame(loop)
    } else {
      running.value = false
      stop()
    }
  }

  // Auto-capture removed for better accuracy - manual capture only

  // Store low-res video dimensions for quad scaling
  let lowResWidth = 0
  let lowResHeight = 0

  // Manual capture trigger - switch to high-res briefly
  const manualCapture = async () => {
    if (!lastQuadVideo) {
      console.warn('No document detected to capture')
      return
    }

    // Save current low-res dimensions
    lowResWidth = video.value!.videoWidth
    lowResHeight = video.value!.videoHeight

    // Temporarily pause detection loop
    const wasRunning = running.value
    running.value = false

    // Switch to HIGH resolution
    console.log('📸 Switching to high-res for capture...')
    await switchResolution(video.value!, true)

    // Wait a moment for camera to adjust
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Capture at high resolution
    const rgba = grabRGBA(video.value!)
    if (!rgba) {
      console.error('Failed to grab high-res frame')
      // Switch back and resume
      await switchResolution(video.value!, false)
      if (wasRunning) {
        running.value = true
        requestAnimationFrame(loop)
      }
      return
    }

    // Scale the quad coordinates from low-res to high-res
    const highResWidth = rgba.width
    const highResHeight = rgba.height
    const scaleX = highResWidth / lowResWidth
    const scaleY = highResHeight / lowResHeight

    console.log(
      `📸 Scaling quad: ${lowResWidth}x${lowResHeight} -> ${highResWidth}x${highResHeight} (scale: ${scaleX.toFixed(2)}x, ${scaleY.toFixed(
        2
      )}y)`
    )

    // Scale the quad to match high-res frame
    const scaledQuad = lastQuadVideo.map((coord, idx) => {
      return idx % 2 === 0 ? coord * scaleX : coord * scaleY
    })

    console.log('📸 Scaled quad for crop editor:', scaledQuad)
    console.log('📸 Scaled quad length:', scaledQuad.length)
    console.log('📸 Scaled quad values:', JSON.stringify(scaledQuad))
    console.log('📸 Image size for crop editor:', rgba.width, 'x', rgba.height)

    // Switch back to LOW resolution BEFORE opening editor
    console.log('📸 Switching back to low-res...')
    await switchResolution(video.value!, false)
    await new Promise((resolve) => setTimeout(resolve, 200))

    // Resume detection loop
    if (wasRunning) {
      running.value = true
      requestAnimationFrame(loop)
    }

    // NOW show crop editor with captured data
    pendingCaptureImage.value = rgba
    pendingCaptureQuad.value = [...scaledQuad]

    await nextTick()
    showCropEditor.value = true

    console.log('📸 Crop editor opened with quad:', pendingCaptureQuad.value)
  }

  // Capture a page
  const capturePage = (rgba: ImageData, quad: number[]) => {
    // IMPORTANT: Flatten the image immediately using the original high-res frame
    // This gives us the cropped, perspective-corrected document
    console.log('📸 Capturing page:')
    console.log('  - Video resolution:', rgba.width, 'x', rgba.height)
    console.log('  - Quad (video coords):', quad)
    const flattened = flattenImage(rgba, quad)

    if (!flattened) {
      console.error('Failed to flatten image')
      return
    }

    // Store the flattened image (this is what goes in the PDF)
    const page = addPage(flattened, quad)
    console.log('✅ Page captured:', page.id, `${flattened.width}x${flattened.height}px`)

    // Render thumbnail from the flattened image
    nextTick(() => {
      const canvas = pageCanvases.get(page.id)
      if (canvas) {
        const thumb = createThumbnail(flattened, 200)
        canvas.width = thumb.width
        canvas.height = thumb.height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.putImageData(thumb, 0, 0)
        }
      }
    })
  }

  // Remove page
  const removePage = (id: string) => {
    pageCanvases.delete(id)
    removePageFromState(id)
  }

  // Clear all pages
  const clearAllPages = () => {
    if (confirm('Delete all captured pages?')) {
      pageCanvases.clear()
      clearPages()
      showExportDialog.value = false
    }
  }

  // Set canvas ref for page thumbnails
  const setPageCanvas = (pageId: string, el: any) => {
    if (el instanceof HTMLCanvasElement) {
      pageCanvases.set(pageId, el)
    }
  }

  // Crop editor handlers
  const onCropConfirm = (adjustedQuad: number[]) => {
    if (!pendingCaptureImage.value) return

    console.log('✓ Crop confirmed with adjusted quad:', adjustedQuad)
    capturePage(pendingCaptureImage.value, adjustedQuad)

    // Clean up
    showCropEditor.value = false
    pendingCaptureImage.value = null
    pendingCaptureQuad.value = null
  }

  const onCropCancel = () => {
    console.log('✕ Crop cancelled')
    showCropEditor.value = false
    pendingCaptureImage.value = null
    pendingCaptureQuad.value = null
  }

  // Process all pages and export PDF
  const processingAndExport = async () => {
    isProcessing.value = true
    processedPages.value = 0
    showExportDialog.value = false

    try {
      // Initialize OCR if requested
      if (includeOCR.value) {
        isOCRAvailable.value = await initOCR()
      }

      // Process each page (images are already flattened at capture time)
      for (let i = 0; i < pages.value.length; i++) {
        const page = pages.value[i]

        // Image is already flattened - originalImage IS the flattened COLOR document
        const colorImage = page.originalImage
        console.log(`Processing page ${i + 1}/${pages.value.length}...`)

        // Perform OCR if enabled
        if (includeOCR.value && isOCRAvailable.value) {
          console.log(`Performing OCR on page ${i + 1}...`)
          // Convert to B&W for better OCR accuracy
          const bwImage = convertToBlackAndWhite(colorImage)
          const ocrResult = await performOCR(bwImage, (progress) => {
            updatePageOCR(page.id, '', progress)
          })
          updatePageOCR(page.id, ocrResult.text, 1.0)
        }

        processedPages.value++
      }

      // Generate PDF
      console.log('Generating PDF...')
      const pdfBlob = await generatePDF(pages.value, {
        filename: pdfFilename.value,
        includeOCR: includeOCR.value && isOCRAvailable.value,
      })

      // Download PDF
      downloadPDF(pdfBlob, pdfFilename.value)

      console.log('✅ PDF saved successfully!')

      // Reset
      if (confirm('PDF saved! Clear all pages?')) {
        clearAllPages()
      }
    } catch (error) {
      console.error('Failed to export PDF:', error)
      alert('Failed to export PDF. Check console for details.')
    } finally {
      isProcessing.value = false
      processedPages.value = 0
    }
  }

  onMounted(async () => {
    await ensureWorker()
    isOCRAvailable.value = checkOCRAvailable()
  })
</script>

<style>
  body {
    margin: 0;
    padding: 0;
    font-family: system-ui, sans-serif;
  }
</style>
