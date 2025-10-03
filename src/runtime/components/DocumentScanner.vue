<template>
  <ClientOnly>
    <div class="document-scanner">
      <div class="scanner-stage">
        <div class="scanner-surface">
          <DocumentScannerCamera v-show="isCamera" ref="cameraRef" />
          <DocumentScannerEdges v-show="isEdges" :edge-map="currentEdgeMap" />
          <DocumentScannerOverlay
            v-show="isCamera || isEdges"
            ref="overlayRef"
            :quad="displayQuad"
            :detected="quadDetected"
            :stable="isStable"
          />
          <DocumentScannerPreview
            v-show="isPreview"
            :images="previewImages"
            :default-name="defaultName"
            @back="handleBack"
            @save="handleSave"
          />
        </div>

        <DocumentScannerTopControl
          v-show="showTopControls && (isCamera || isEdges)"
          :mode="mode"
          @mode-switch="modeSwitch"
        />

        <DocumentScannerControl
          class="scanner-controls"
          :thumbnail="thumbnail"
          :can-capture="isStable && !isInitializing"
          :is-stable="isStable"
          :auto-capture-progress="autoCaptureProgress"
          @close="handleClose"
          @capture="handleCapture"
          @open-preview="handleOpenPreview"
        />

        <!-- Loading indicator -->
        <div v-if="isInitializing" class="loading-indicator">
          <div class="loading-spinner" />
          <div class="loading-text">Initializing scanner...</div>
        </div>
      </div>
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRuntimeConfig } from '#imports'
import { useDocumentScanner } from '../composables/useDocumentScanner'
import { useCamera } from '../composables/useCamera'
import { grabRGBA } from '../utils/image-processing'

// Props
const props = withDefaults(
  defineProps<{
    mode?: 'camera' | 'preview' | 'edges'
    showTopControls?: boolean
    modelPath?: string
    defaultName?: string
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
    defaultName: 'Scanned document',
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

// Mode state
const mode = ref(props.mode)
const isCamera = computed(() => mode.value === 'camera')
const isPreview = computed(() => mode.value === 'preview')
const isEdges = computed(() => mode.value === 'edges')
const showTopControls = ref(props.showTopControls)

// Get model path
const modelPath = computed(() => {
  if (props.modelPath) return props.modelPath

  const version = moduleOptions.model?.version || 'tiny'
  const name = moduleOptions.model?.name || 'pidinet'
  return `/models/${name}_${version}.onnx`
})

// Camera composable for resolution switching
const camera = useCamera()

console.log(moduleOptions.autoCapture?.stableFramesRequired)

// Scanner composable
const scanner = useDocumentScanner({
  modelPath: modelPath.value,
  preferExecutionProvider: moduleOptions.inference?.prefer || 'wasm',
  targetResolution: moduleOptions.inference?.targetResolution || 192,
  edgeThreshold: moduleOptions.edgeDetection?.threshold || 0.5,
  edgeDetectionParams: {
    houghThreshold: moduleOptions.edgeDetection?.houghThreshold || 60,
    minLineLength: moduleOptions.edgeDetection?.minLineLength || 40,
    maxLineGap: moduleOptions.edgeDetection?.maxLineGap || 15,
    minAreaPercent: moduleOptions.edgeDetection?.minAreaPercent || 0.03,
  },
  smoothingAlpha: moduleOptions.edgeDetection?.smoothingAlpha || 0.5,
  performanceOptions: {
    targetFps: moduleOptions.performance?.targetFps || 30,
    minFrameSkip: moduleOptions.performance?.minFrameSkip || 1,
    maxFrameSkip: moduleOptions.performance?.maxFrameSkip || 6,
    stableFramesThreshold:
      moduleOptions.performance?.stableFramesThreshold || 10,
    useTransferableObjects:
      moduleOptions.performance?.useTransferableObjects ?? true,
  },
  stabilityOptions: {
    stableFramesRequired: moduleOptions.autoCapture?.stableFramesRequired || 30,
    motionThreshold: moduleOptions.autoCapture?.motionThreshold || 8,
  },
  onReady: () => {
    console.log('✅ Document scanner ready')
    console.log('📊 Performance settings:', {
      targetFps: moduleOptions.performance?.targetFps || 30,
      targetResolution: moduleOptions.inference?.targetResolution || 192,
    })
    isInitializing.value = false
    startLoop()
  },
  onError: (error) => {
    console.error('❌ Scanner error:', error)
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
const currentEdgeMap = computed(() => scanner.currentEdgeMap.value)

// Auto-capture state
const autoCaptureProgress = ref(0)
const autoCaptureEnabled = computed(
  () => moduleOptions.autoCapture?.enabled ?? false,
)
const autoCaptureDuration = computed(
  () => moduleOptions.autoCapture?.countdownDuration || 2000,
)
let autoCaptureTimeout: ReturnType<typeof setTimeout> | undefined
let autoCaptureStartTime = 0
let autoCaptureAnimationFrame: number | undefined

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
let frameCount = 0
let processedFrameCount = 0
let lastFpsUpdate = 0

/**
 * Main detection loop
 */
async function loop() {
  if (!scanner.isRunning.value) {
    animationFrameId = undefined
    return
  }

  const now = performance.now()
  const dt = Math.max(0, now - lastTimestamp)
  const alpha = 1 - Math.exp(-dt / (props.smoothingTauMs || 120))
  lastTimestamp = now
  const maxStep = (props.maxPixelStep || 48) * (dt / (1000 / 60))
  const videoElement = cameraRef.value?.video

  // Count all frames
  frameCount++

  // Check if we should process this frame (adaptive skipping)
  const shouldProcess = scanner.shouldProcessFrame(frameCount)

  if (
    videoElement &&
    videoElement.readyState >= 2 &&
    scanner.isInitialized.value &&
    shouldProcess
  ) {
    try {
      // Process frame
      processedFrameCount++
      const result = await scanner.processFrame(videoElement)

      // Scale quad to display coordinates
      if (result.quadSmoothed && overlayRef.value?.canvas) {
        const video = videoElement
        const canvas = overlayRef.value.canvas

        const videoWidth = video.videoWidth
        const videoHeight = video.videoHeight
        const displayWidth = canvas.width
        const displayHeight = canvas.height

        if (videoWidth && videoHeight) {
          const scaleX = displayWidth / videoWidth
          const scaleY = displayHeight / videoHeight
          const displayScale = Math.max(scaleX, scaleY)

          const scaledVideoWidth = videoWidth * displayScale
          const scaledVideoHeight = videoHeight * displayScale
          const offsetX = (displayWidth - scaledVideoWidth) / 2
          const offsetY = (displayHeight - scaledVideoHeight) / 2

          // Scale quad from video to display coordinates and set as target
          const scaledQuad = result.quadSmoothed.map((coord, idx) => {
            if (idx % 2 === 0) {
              return coord * displayScale + offsetX
            } else {
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
        }
      } else {
        // Hysteresis: hold last target briefly to avoid flicker on brief losses
        if (now - lastTargetTimestamp > (props.lostHoldMs || 150)) {
          targetQuad.value = undefined
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
      console.error('Loop error:', error)
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
function modeSwitch(newMode: 'camera' | 'preview' | 'edges') {
  console.log('Mode switch:', newMode)
  mode.value = newMode
  if (newMode === 'camera' || newMode === 'edges') {
    startLoop()
  } else {
    stopLoop()
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
 * Handle capture (manual or auto)
 */
async function handleCapture() {
  if (!isStable.value || !scanner.lastQuad.value) return

  const videoElement = cameraRef.value?.video
  if (!videoElement) return

  console.log('📸 Capturing document...')

  // Switch to high resolution
  console.log('📹 Switching to high resolution...')
  await camera.switchResolution(videoElement, true)

  // Wait a frame for camera to stabilize
  await new Promise((resolve) => setTimeout(resolve, 200))

  // Capture high-res frame
  const rgba = grabRGBA(videoElement)

  // Switch back to normal resolution
  console.log('📹 Switching back to normal resolution...')
  await camera.switchResolution(videoElement, false)

  if (!rgba) return

  // Capture document with current quad
  const doc = scanner.captureDocument(rgba, scanner.lastQuad.value, 1000)

  if (doc) {
    thumbnail.value = doc.thumbnail
    emit('capture', doc.warped!)
    console.log('✅ Document captured:', doc.id, `${rgba.width}x${rgba.height}`)
  }

  // Reset auto-capture
  cancelAutoCapture()
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
    // Start auto-capture countdown
    console.log('🟢 Quad stable - starting auto-capture countdown')
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
      console.error('Failed to initialize scanner:', error)
      isInitializing.value = false
    })
  }, 500)
})

onBeforeUnmount(() => {
  stopLoop()
  scanner.dispose()
  cancelAutoCapture()
})
</script>

<style scoped>
.document-scanner {
  width: 100%;
  height: 100vh;
  background: #000;
  color: #fff;
  position: relative;
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
</style>
