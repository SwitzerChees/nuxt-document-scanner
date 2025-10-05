<template>
  <ClientOnly>
    <div class="document-scanner">
      <div class="scanner-stage">
        <div class="scanner-surface">
          <DocumentScannerCamera
            v-show="isCamera || isHeatmaps"
            ref="cameraRef"
          />
          <DocumentScannerHeatmaps
            v-show="isHeatmaps"
            :heatmaps="scanner.currentHeatmaps.value"
            :video-width="currentVideoResolution.width"
            :video-height="currentVideoResolution.height"
            :display-width="overlayRef?.canvas?.width || 0"
            :display-height="overlayRef?.canvas?.height || 0"
            :model-input-size="256"
          />
          <DocumentScannerOverlay
            v-show="isCamera || isHeatmaps"
            ref="overlayRef"
            :quad="displayQuad"
            :detected="quadDetected"
            :stable="isStable"
          />
          <DocumentScannerPreview
            v-show="isPreview"
            :images="previewImages"
            :document-name="documentName"
            @back="handleBack"
            @save="handleSave"
          />
        </div>

        <DocumentScannerTopControl
          v-show="showTopControls && (isCamera || isHeatmaps)"
          :mode="mode"
          @mode-switch="modeSwitch"
        />

        <DocumentScannerControl
          v-show="!isPreview"
          class="scanner-controls"
          :thumbnail="thumbnail"
          :can-capture="isStable && !isInitializing"
          :is-stable="isStable"
          :capture-progress="autoCaptureProgress"
          @close="handleClose"
          @capture="handleCapture"
          @open-preview="handleOpenPreview"
        />

        <!-- Loading indicator -->
        <div v-if="isInitializing" class="loading-indicator">
          <div class="loading-spinner" />
          <div class="loading-text">Initializing scanner...</div>
        </div>

        <!-- Capture overlay -->
        <div v-if="isCapturing" class="capture-overlay">
          <div class="capture-flash" />
          <div class="capture-spinner" />
          <div class="capture-text">Capturing...</div>
        </div>
      </div>
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRuntimeConfig } from '#imports'
import { useDocumentScanner } from '../composables/useDocumentScanner'
import { grabRGBA } from '../utils/image-processing'
import { log, logError, logWarn } from '../utils/logging'

// Props
const props = withDefaults(
  defineProps<{
    mode?: 'camera' | 'preview' | 'heatmaps'
    showTopControls?: boolean
    modelPath?: string
    documentName?: string
    // Visual smoothing controls
    smoothingTauMs?: number
    adaptiveSmoothing?: boolean
    oneEuroMinCutoff?: number
    oneEuroBeta?: number
    oneEuroDerivativeCutoff?: number
    snapEpsilon?: number
    maxPixelStep?: number
    lostHoldMs?: number
  }>(),
  {
    mode: 'camera',
    showTopControls: true,
    documentName:
      new Date()
        .toLocaleDateString('de-CH', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
        .replace(/\./g, '') +
      '_' +
      new Date()
        .toLocaleTimeString('de-CH', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
        .replace(/:/g, ''),
    smoothingTauMs: 120,
    adaptiveSmoothing: false,
    oneEuroMinCutoff: 1.0,
    oneEuroBeta: 0.01,
    oneEuroDerivativeCutoff: 1.0,
    snapEpsilon: 0.75,
    maxPixelStep: 48,
    lostHoldMs: 150,
  },
)

// Emits
const emit = defineEmits<{
  close: []
  capture: [imageData: ImageData]
  save: [documents: any[]]
}>()

// Runtime config
const config = useRuntimeConfig()
const moduleOptions = (config.public.documentScanner || {}) as any

// Component refs
const cameraRef = ref<any>()
const overlayRef = ref<any>()

// Track current video resolution for scaling
const currentVideoResolution = ref({ width: 0, height: 0 })

// Mode state
const mode = ref(props.mode)
const isCamera = computed(() => mode.value === 'camera')
const isPreview = computed(() => mode.value === 'preview')
const isHeatmaps = computed(() => mode.value === 'heatmaps')
const showTopControls = ref(props.showTopControls)

// Get model path
const modelPath = computed(() => {
  if (props.modelPath) return props.modelPath

  const name = moduleOptions.model?.name || 'lcnet100_h_e_bifpn_256_fp32'
  // If name already includes .onnx, use it as is, otherwise add it
  return name.endsWith('.onnx') ? `/models/${name}` : `/models/${name}.onnx`
})

// Scanner composable
const scanner = useDocumentScanner({
  modelPath: modelPath.value,
  opencvUrl: moduleOptions.openCV?.url,
  preferExecutionProvider: moduleOptions.inference?.prefer,
  targetResolution: moduleOptions.inference?.targetResolution,
  threads: moduleOptions.inference?.threads,
  smoothingAlpha: moduleOptions.smoothingAlpha,
  stabilityOptions: {
    stableDuration: moduleOptions.capture?.stableDuration,
    motionThreshold: moduleOptions.capture?.motionThreshold,
  },
  onReady: () => {
    log('✅ Document scanner ready')
    log('📊 Settings:', {
      targetResolution: moduleOptions.inference?.targetResolution,
    })
    isInitializing.value = false
    startLoop()
  },
  onError: (error) => {
    logError('❌ Scanner error:', error)
  },
})

// Detection state
const displayQuad = ref<number[]>()
const targetQuad = ref<number[]>() // Target quad from detection
const lastQuad = ref<number[]>()
const quadDetected = computed(() => scanner.detectionStats.value.quadDetected)
const isStable = computed(() => scanner.isStable.value)
const thumbnail = ref<string>()
const isInitializing = ref(true)
const isCapturing = ref(false) // Track capture state
// Edge maps are no longer used with DocAligner
// Quad to use for capture, kept in VIDEO coordinate space but visually matched
// to the displayed quad (accounts for object-fit: cover scaling and offsets)
const captureQuadVideoSpace = ref<number[]>()

// Auto-capture state
const autoCaptureProgress = ref(0)
const autoCaptureEnabled = computed(
  () => moduleOptions.capture?.autoCapture ?? false,
)
const autoCaptureDuration = computed(
  () => moduleOptions.capture?.countdownDuration || 2000,
)
let autoCaptureTimeout: ReturnType<typeof setTimeout> | undefined
let autoCaptureStartTime = 0
let autoCaptureAnimationFrame: number | undefined

// Re-capture protection
const lastCaptureAt = ref(0)
const lastCapturedQuad = ref<number[] | undefined>()

function quadChangedSignificantly(a?: number[], b?: number[]): boolean {
  if (!a || !b || a.length !== 8 || b.length !== 8) return true
  // Average point distance threshold in VIDEO pixels
  let sum = 0
  for (let i = 0; i < 8; i += 2) {
    const dx = (a[i] ?? 0) - (b[i] ?? 0)
    const dy = (a[i + 1] ?? 0) - (b[i + 1] ?? 0)
    sum += Math.hypot(dx, dy)
  }
  const avg = sum / 4
  return avg > 24 // require ~24px average movement to re-arm
}

// Time-aware smoothing and adaptive filter setup
let lastTimestamp = performance.now()
let lastTargetTimestamp = 0

class LowPass {
  private hatX = 0
  private initialized = false
  filter(x: number, alpha: number) {
    if (!this.initialized) {
      this.hatX = x
      this.initialized = true
      return x
    }
    this.hatX = alpha * x + (1 - alpha) * this.hatX
    return this.hatX
  }
}

function alphaFromCutoff(dtSeconds: number, cutoff: number) {
  const r = 2 * Math.PI * cutoff
  return (r * dtSeconds) / (r * dtSeconds + 1)
}

class OneEuro {
  private xFilter = new LowPass()
  private dxFilter = new LowPass()
  private lastTime = 0
  constructor(
    private minCutoff = 1.0,
    private beta = 0.01,
    private dCutoff = 1.0,
  ) {}
  filter(x: number, timestampMs: number) {
    const dtSeconds = this.lastTime
      ? Math.max(0.0001, (timestampMs - this.lastTime) / 1000)
      : 1 / 60
    this.lastTime = timestampMs
    const dx = this.dxFilter.filter(
      x - (this as any).xFilter.hatX,
      alphaFromCutoff(dtSeconds, this.dCutoff),
    )
    const cutoff = this.minCutoff + this.beta * Math.abs(dx)
    const a = alphaFromCutoff(dtSeconds, cutoff)
    return this.xFilter.filter(x, a)
  }
}

const oneEuroFilters: OneEuro[] = Array.from(
  { length: 8 },
  () =>
    new OneEuro(
      props.oneEuroMinCutoff || 1.0,
      props.oneEuroBeta || 0.01,
      props.oneEuroDerivativeCutoff || 1.0,
    ),
)

function interpolateQuadTimeAware(
  current: number[] | undefined,
  target: number[] | undefined,
  alpha: number,
  snapEpsilon: number,
  maxStep: number,
): number[] | undefined {
  if (!target) return current
  if (!current) return target

  const next = target.map((t, i) => {
    const c = current[i] ?? t
    const delta = t - c
    // clamp per-frame movement, then apply time-aware smoothing
    const limitedDelta =
      Math.abs(delta) > maxStep ? Math.sign(delta) * maxStep : delta
    return c + limitedDelta * alpha
  })

  const maxAbsDelta = Math.max(
    ...target.map((t, i) => Math.abs(t - (next[i] ?? t))),
  )
  return maxAbsDelta < snapEpsilon ? target : next
}

// Preview state
const previewImages = computed(() =>
  scanner.documents.value.map((doc) => doc.thumbnail || ''),
)

// Main loop state
let animationFrameId: number | undefined
let processedFrameCount = 0
let lastFpsUpdate = 0

/**
 * Main detection loop
 */
async function loop() {
  if (!scanner.isRunning.value || isCapturing.value) {
    // Skip frame if capturing (prevents jumping during resolution switch)
    if (!isCapturing.value) {
      animationFrameId = undefined
      return
    }
    animationFrameId = requestAnimationFrame(loop)
    return
  }

  const now = performance.now()
  const dt = Math.max(0, now - lastTimestamp)
  const alpha = 1 - Math.exp(-dt / (props.smoothingTauMs || 120))
  lastTimestamp = now
  const maxStep = (props.maxPixelStep || 48) * (dt / (1000 / 60))
  const videoElement = cameraRef.value?.video

  // Track current video resolution for scaling during capture
  if (videoElement?.videoWidth && videoElement?.videoHeight) {
    if (
      currentVideoResolution.value.width !== videoElement.videoWidth ||
      currentVideoResolution.value.height !== videoElement.videoHeight
    ) {
      currentVideoResolution.value = {
        width: videoElement.videoWidth,
        height: videoElement.videoHeight,
      }
    }
  }

  if (
    videoElement &&
    videoElement.readyState >= 2 &&
    scanner.isInitialized.value
  ) {
    try {
      // Process frame (request heatmaps in heatmap mode)
      processedFrameCount++
      const result = await scanner.processFrame(videoElement, isHeatmaps.value)

      // Scale quad to display coordinates
      if (result.quadSmoothed && overlayRef.value?.canvas) {
        const video = videoElement
        const canvas = overlayRef.value.canvas

        const videoWidth = video.videoWidth
        const videoHeight = video.videoHeight
        const displayWidth = canvas.width
        const displayHeight = canvas.height

        if (videoWidth && videoHeight && displayWidth && displayHeight) {
          // For object-fit: cover, we scale to fill and center-crop
          const scaleX = displayWidth / videoWidth
          const scaleY = displayHeight / videoHeight
          const displayScale = Math.max(scaleX, scaleY) // cover uses max (fill entire area)

          const scaledVideoWidth = videoWidth * displayScale
          const scaledVideoHeight = videoHeight * displayScale

          // Calculate offsets for centered cropping
          const offsetX = (displayWidth - scaledVideoWidth) / 2
          const offsetY = (displayHeight - scaledVideoHeight) / 2

          // Scale quad from video to display coordinates and set as target
          const scaledQuad = result.quadSmoothed.map((coord, idx) => {
            if (idx % 2 === 0) {
              // X coordinate
              return coord * displayScale + offsetX
            } else {
              // Y coordinate
              return coord * displayScale + offsetY
            }
          })
          // Optional adaptive smoothing (One Euro) per coordinate
          const nextTarget = props.adaptiveSmoothing
            ? scaledQuad.map(
                (v: number, i: number) =>
                  oneEuroFilters[i]?.filter(v, now) ?? v,
              )
            : scaledQuad
          targetQuad.value = nextTarget
          lastTargetTimestamp = now
          lastQuad.value = result.quadSmoothed

          // Compute the quad in VIDEO coordinates that corresponds to what we display
          // Inverse transform of object-fit: cover scaling and center-crop offsets
          const videoQuad = (nextTarget || []).map((v: number, i: number) =>
            i % 2 === 0
              ? (v - (offsetX || 0)) / (displayScale || 1)
              : (v - (offsetY || 0)) / (displayScale || 1),
          )

          // Clamp to video bounds to avoid tiny rounding issues
          for (let i = 0; i < videoQuad.length; i += 2) {
            const x = videoQuad[i] ?? 0
            const y = videoQuad[i + 1] ?? 0
            videoQuad[i] = Math.max(0, Math.min(videoWidth || 0, x))
            videoQuad[i + 1] = Math.max(0, Math.min(videoHeight || 0, y))
          }
          captureQuadVideoSpace.value = videoQuad
        }
      } else {
        // Hysteresis: hold last target briefly to avoid flicker on brief losses
        if (now - lastTargetTimestamp > (props.lostHoldMs || 150)) {
          targetQuad.value = undefined
          captureQuadVideoSpace.value = undefined
        }
      }

      // Update FPS (based on processed frames)
      if (now - lastFpsUpdate >= 1000) {
        scanner.fps.value = Math.round(
          (processedFrameCount * 1000) / (now - lastFpsUpdate),
        )
        processedFrameCount = 0
        lastFpsUpdate = now
      }
    } catch (error) {
      logError('Loop error:', error)
    }
  }

  // Interpolate displayQuad towards targetQuad every frame (time-aware smoothing)
  if (targetQuad.value) {
    displayQuad.value = interpolateQuadTimeAware(
      displayQuad.value,
      targetQuad.value,
      alpha,
      props.snapEpsilon || 0.75,
      maxStep,
    )
  } else {
    displayQuad.value = undefined
  }

  animationFrameId = requestAnimationFrame(loop)
}

/**
 * Start the detection loop
 */
function startLoop() {
  if (!animationFrameId && scanner.isInitialized.value) {
    scanner.start()
    lastFpsUpdate = performance.now()
    animationFrameId = requestAnimationFrame(loop)
  }
}

/**
 * Stop the detection loop
 */
function stopLoop() {
  scanner.stop()
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = undefined
  }
}

/**
 * Mode switch
 */
async function modeSwitch(newMode: 'camera' | 'preview' | 'heatmaps') {
  log('Mode switch:', newMode)
  mode.value = newMode
  const videoElement = cameraRef.value?.video as HTMLVideoElement | undefined
  if (newMode === 'camera' || newMode === 'heatmaps') {
    // Resume camera: restart stream and detection
    try {
      await cameraRef.value?.start?.(videoElement)
    } catch (e) {
      logWarn('Camera start failed', e)
    }
    startLoop()
  } else {
    // Entering preview: fully stop detection and camera stream
    stopLoop()
    try {
      await cameraRef.value?.stop?.()
    } catch (e) {
      logWarn('Camera stop failed', e)
    }
  }
}

/**
 * Handle back from preview
 */
function handleBack() {
  modeSwitch('camera')
}

/**
 * Handle close
 */
function handleClose() {
  stopLoop()
  emit('close')
}

/**
 * Handle capture (manual or auto) with high-resolution switch
 */
async function handleCapture() {
  if (!isStable.value || isCapturing.value) return

  const videoElement = cameraRef.value?.video
  if (!videoElement) return

  const quadForCapture = captureQuadVideoSpace.value || scanner.lastQuad.value
  if (!quadForCapture) return

  log('📸 Capturing document at high resolution...')
  log('📐 Quad for capture:', quadForCapture)

  // Set capturing flag to pause detection
  isCapturing.value = true

  // Stop scanner to prevent worker interference
  log('⏸️  Stopping scanner for capture...')
  scanner.stop()

  // Wait a moment for any in-flight worker messages to complete
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Get camera composable from ref
  const cameraComposable = cameraRef.value
  if (!cameraComposable?.switchResolution) {
    logWarn(
      'Camera switchResolution not available, capturing at current resolution',
    )
    const rgba = grabRGBA(videoElement)
    if (rgba) {
      const doc = await scanner.captureDocument(rgba, quadForCapture, 1000)
      if (doc) {
        thumbnail.value = doc.thumbnail
        emit('capture', doc.warped!)
        log('✅ Document captured:', doc.id, `${rgba.width}x${rgba.height}`)
      }
    }
    cancelAutoCapture()
    isCapturing.value = false
    scanner.start() // Restart scanner
    return
  }

  try {
    // Store preview resolution and quad
    const previewWidth = currentVideoResolution.value.width
    const previewHeight = currentVideoResolution.value.height
    const previewQuad = [...quadForCapture]

    // Get display dimensions for switching back
    const container = videoElement.parentElement
    const displayWidth = container
      ? Math.max(container.clientWidth, container.clientHeight)
      : 1920
    const displayHeight = container
      ? Math.min(container.clientWidth, container.clientHeight)
      : 1080

    // Switch to high resolution
    const highResConfig = moduleOptions.camera?.highResCapture || 3840
    log('📹 Switching to high-res...', { target: highResConfig })

    const highResResult = await cameraComposable.switchResolution(
      videoElement,
      true,
      {
        highResolution: highResConfig,
      },
    )

    if (!highResResult) {
      throw new Error('Failed to switch to high resolution')
    }

    // Wait for video to be ready (important!)
    await new Promise((resolve) => setTimeout(resolve, 200))

    // Get actual high-res resolution
    const highResWidth = videoElement.videoWidth
    const highResHeight = videoElement.videoHeight

    log('📹 High-res active:', {
      preview: `${previewWidth}x${previewHeight}`,
      highRes: `${highResWidth}x${highResHeight}`,
      scale: `${(highResWidth / previewWidth).toFixed(2)}x`,
    })

    // Scale quad from preview resolution to high-res resolution
    const scaleX = highResWidth / previewWidth
    const scaleY = highResHeight / previewHeight
    const scaledQuad = previewQuad.map((coord, idx) =>
      idx % 2 === 0 ? coord * scaleX : coord * scaleY,
    )

    log('📐 Quad scaling:', {
      preview: `${previewWidth}x${previewHeight}`,
      highRes: `${highResWidth}x${highResHeight}`,
      scaleX: scaleX.toFixed(3),
      scaleY: scaleY.toFixed(3),
      previewQuad: previewQuad.map((c) => Math.round(c)),
      scaledQuad: scaledQuad.map((c) => Math.round(c)),
      quadAsPercent: scaledQuad.map((c, i) =>
        i % 2 === 0
          ? `${((c / highResWidth) * 100).toFixed(1)}%`
          : `${((c / highResHeight) * 100).toFixed(1)}%`,
      ),
    })

    // Capture high-resolution frame
    const rgba = grabRGBA(videoElement)
    if (!rgba) {
      throw new Error('Failed to capture high-res frame')
    }

    log('📷 Captured frame:', `${rgba.width}x${rgba.height}`)

    // Warp document at high resolution
    const doc = await scanner.captureDocument(rgba, scaledQuad, 1500) // Higher output width for high-res

    if (doc) {
      thumbnail.value = doc.thumbnail
      emit('capture', doc.warped!)
      log(
        '✅ High-res document captured:',
        doc.id,
        `Input: ${rgba.width}x${rgba.height}`,
        `Output: ${doc.warped?.width}x${doc.warped?.height}`,
      )
    }

    // Switch back to preview resolution
    log('📹 Switching back to preview resolution...')
    await cameraComposable.switchResolution(videoElement, false, {
      width: displayWidth,
      height: displayHeight,
      highResolution: highResConfig,
    })

    // Wait for video to stabilize
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Update tracked resolution
    currentVideoResolution.value = {
      width: videoElement.videoWidth,
      height: videoElement.videoHeight,
    }

    log('📹 Back to preview:', currentVideoResolution.value)
  } catch (error) {
    logError('❌ High-res capture failed:', error)

    // Try to recover by switching back to preview
    try {
      const container = videoElement.parentElement
      const displayWidth = container
        ? Math.max(container.clientWidth, container.clientHeight)
        : 1920
      const displayHeight = container
        ? Math.min(container.clientWidth, container.clientHeight)
        : 1080

      await cameraComposable.switchResolution(videoElement, false, {
        width: displayWidth,
        height: displayHeight,
      })

      currentVideoResolution.value = {
        width: videoElement.videoWidth,
        height: videoElement.videoHeight,
      }
    } catch (recoveryError) {
      logError('❌ Failed to recover camera:', recoveryError)
    }
  } finally {
    // Reset auto-capture and capturing flag
    cancelAutoCapture()
    isCapturing.value = false

    // Restart scanner for continued detection
    log('▶️  Restarting scanner after capture')
    scanner.start()

    // Mark last capture time and quad to prevent immediate re-trigger
    lastCaptureAt.value = performance.now()
    lastCapturedQuad.value = (
      captureQuadVideoSpace.value || lastQuad.value
    )?.slice()
  }
}

/**
 * Update auto-capture countdown progress
 */
function updateAutoCaptureProgress() {
  if (!autoCaptureStartTime) return

  const elapsed = performance.now() - autoCaptureStartTime
  const progress = Math.min(elapsed / autoCaptureDuration.value, 1)
  autoCaptureProgress.value = progress

  if (progress < 1) {
    autoCaptureAnimationFrame = requestAnimationFrame(updateAutoCaptureProgress)
  }
}

/**
 * Cancel auto-capture countdown
 */
function cancelAutoCapture() {
  if (autoCaptureTimeout) {
    clearTimeout(autoCaptureTimeout)
    autoCaptureTimeout = undefined
  }
  if (autoCaptureAnimationFrame) {
    cancelAnimationFrame(autoCaptureAnimationFrame)
    autoCaptureAnimationFrame = undefined
  }
  autoCaptureStartTime = 0
  autoCaptureProgress.value = 0
}

/**
 * Handle open preview
 */
function handleOpenPreview() {
  if (scanner.documents.value.length > 0) {
    // Immediately cancel any pending auto-capture and switch to preview
    cancelAutoCapture()
    modeSwitch('preview')
  }
}

/**
 * Handle save
 */
function handleSave() {
  emit('save', scanner.documents.value)
  scanner.clearDocuments()
  modeSwitch('camera')
}

/**
 * Watch for stability to trigger auto-capture
 */
watch(isStable, (stable) => {
  if (!autoCaptureEnabled.value) return

  if (stable && isCamera.value) {
    // Debounce after a capture and require movement before re-arming
    const now = performance.now()
    const quadNow = captureQuadVideoSpace.value || lastQuad.value
    const cooldownMs = 1200
    if (now - lastCaptureAt.value < cooldownMs) {
      return
    }
    if (!quadChangedSignificantly(quadNow, lastCapturedQuad.value)) {
      return
    }

    // Start auto-capture countdown
    log('🟢 Quad stable - starting auto-capture countdown')
    autoCaptureStartTime = performance.now()
    autoCaptureAnimationFrame = requestAnimationFrame(updateAutoCaptureProgress)

    autoCaptureTimeout = setTimeout(() => {
      handleCapture()
    }, autoCaptureDuration.value)
  } else {
    // Cancel auto-capture
    cancelAutoCapture()
  }
})

/**
 * Lifecycle
 */
onMounted(() => {
  // Initialize scanner in background (non-blocking)
  // This allows camera to start first
  setTimeout(() => {
    scanner.initialize().catch((error) => {
      logError('Failed to initialize scanner:', error)
      isInitializing.value = false
    })
  }, 500)
})

onBeforeUnmount(async () => {
  stopLoop()
  cancelAutoCapture()
  await scanner.dispose()
})
</script>

<style scoped>
.document-scanner {
  width: 100%;
  height: 100vh;
  height: 100dvh; /* Dynamic viewport height for iOS */
  background: #000;
  color: #fff;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  z-index: 1000;
}

.scanner-stage {
  position: relative;
  width: 100%;
  height: 100%;
}

.scanner-surface {
  position: absolute;
  inset: 0;
  background: #111;
  overflow: hidden;
}

.scanner-controls {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
}

.loading-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  background: rgba(0, 0, 0, 0.8);
  padding: 24px 32px;
  border-radius: 12px;
  backdrop-filter: blur(8px);
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.2);
  border-top-color: #00ff88;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  color: #e5e7eb;
  font-size: 14px;
  font-weight: 500;
}

/* Capture overlay - hides camera flickering during resolution switch */
.capture-overlay {
  position: absolute;
  inset: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(8px);
}

.capture-flash {
  position: absolute;
  inset: 0;
  background: white;
  animation: flash 0.3s ease-out forwards;
  pointer-events: none;
}

.capture-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.2);
  border-top-color: #00ff88;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.capture-text {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

@keyframes flash {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
  100% {
    opacity: 0;
  }
}
</style>
