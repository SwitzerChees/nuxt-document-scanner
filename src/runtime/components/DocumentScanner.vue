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
import { log, logError, logWarn } from '../utils/logging'

// Extend ImageCapture type to include grabFrame (not in all type definitions)
interface ExtendedImageCapture extends ImageCapture {
  grabFrame?: () => Promise<ImageBitmap>
}

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
  return name.endsWith('.onnx')
    ? `/nuxt-document-scanner/models/${name}`
    : `/nuxt-document-scanner/models/${name}.onnx`
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
    overlaySmoothingAlpha: moduleOptions.capture?.overlaySmoothingAlpha,
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
 * Main detection loop - optimized for mobile devices
 */
async function loop() {
  // If capturing, fully stop the loop (will be restarted after capture)
  if (isCapturing.value) {
    animationFrameId = undefined
    return
  }

  // If scanner not running, stop the loop
  if (!scanner.isRunning.value) {
    animationFrameId = undefined
    return
  }

  // If inference is busy, skip this frame but continue loop
  if (scanner.isInferenceBusy()) {
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
async function handleClose() {
  stopLoop()
  cancelAutoCapture()

  // Stop camera stream immediately when closing
  try {
    await cameraRef.value?.stop?.()
  } catch (e) {
    logWarn('Camera stop failed during close:', e)
  }

  emit('close')
}

async function capturePhotoWithRetry(
  imageCapture: ExtendedImageCapture,
  captureResolution: number | undefined,
  maxRetries = 5,
): Promise<Blob> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      log(`📸 Capture attempt ${attempt + 1}/${maxRetries}...`)

      const blob = await imageCapture.takePhoto({
        fillLightMode: 'flash',
        imageHeight: captureResolution,
        imageWidth: captureResolution,
      })

      // Verify the blob is valid and has reasonable size
      if (!blob || blob.size < 1000) {
        throw new Error(
          `Photo blob is too small or invalid (${blob?.size || 0} bytes)`,
        )
      }

      log(`✅ Photo captured successfully: ${(blob.size / 1024).toFixed(1)}KB`)
      return blob
    } catch (e) {
      lastError = e as Error
      logError(`❌ Attempt ${attempt + 1} failed:`, e)

      // Log detailed error info for debugging
      log('Error details:', {
        name: (e as Error).name,
        message: (e as Error).message,
        attempt: attempt + 1,
        maxRetries,
      })

      // Wait before retry with progressive backoff
      // Longer waits give the camera more time to recover/stabilize
      if (attempt < maxRetries - 1) {
        const waitTime = 200 * (attempt + 1) // 200ms, 400ms, 600ms, 800ms, 1000ms
        log(`⏳ Waiting ${waitTime}ms before retry...`)
        await new Promise((resolve) => setTimeout(resolve, waitTime))
      }
    }
  }

  // If all retries failed, throw with detailed error
  throw new Error(
    `Failed to capture photo after ${maxRetries} retries. Last error: ${lastError?.message}. ` +
      `This may indicate: camera permissions revoked, camera hardware busy, or browser incompatibility.`,
  )
}

/**
 * Handle capture (manual or auto) using ImageCapture API - optimized for mobile
 *
 * SOLUTION TO "setPhotoOptions failed" ERROR:
 * - We call takePhoto() WITHOUT any constraints/options
 * - This is the most compatible approach, especially for iOS Safari
 * - The camera automatically uses its native high-resolution photo mode
 * - Passing constraints often causes failures on mobile devices
 *
 * CAPTURE FLOW:
 * 1. Fully stop detection loop and scanner
 * 2. Wait 250ms for camera to stabilize
 * 3. Validate video track is 'live' and enabled
 * 4. Create ImageCapture instance
 * 5. Call takePhoto() with retry logic (5 attempts with progressive backoff)
 * 6. Convert blob to ImageData
 * 7. Scale quad coordinates to match captured resolution
 * 8. Warp document
 * 9. Restart detection loop
 */
async function handleCapture() {
  if (!isStable.value || isCapturing.value) return

  const videoElement = cameraRef.value?.video
  if (!videoElement) return

  const quadForCapture = captureQuadVideoSpace.value || scanner.lastQuad.value
  if (!quadForCapture) return

  log('📸 Starting high-resolution capture...')
  log('📐 Quad for capture:', quadForCapture)

  // Set capturing flag FIRST to immediately pause detection loop
  isCapturing.value = true

  // Cancel animation frame to fully stop the loop
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = undefined
    log('⏸️  Detection loop stopped')
  }

  // Stop scanner to prevent worker interference
  log('⏸️  Stopping scanner...')
  scanner.stop()

  // Wait longer for all async operations to complete
  // This is critical on mobile devices to ensure camera is fully stable
  await new Promise((resolve) => setTimeout(resolve, 250))

  try {
    // Store preview resolution and quad
    const previewWidth = currentVideoResolution.value.width
    const previewHeight = currentVideoResolution.value.height
    const previewQuad = [...quadForCapture]

    // Validate preview resolution
    if (!previewWidth || !previewHeight) {
      throw new Error(
        `Invalid preview resolution: ${previewWidth}x${previewHeight}`,
      )
    }

    // Get the video track from the stream
    const stream = videoElement.srcObject as MediaStream
    if (!stream) {
      throw new Error('No video stream available')
    }

    const videoTracks = stream.getVideoTracks()
    log(`📹 Available video tracks: ${videoTracks.length}`)

    const videoTrack = videoTracks[0]
    if (!videoTrack) {
      throw new Error('No video track available')
    }

    // Check track state and settings before proceeding
    const trackState = videoTrack.readyState
    const trackEnabled = videoTrack.enabled
    const trackMuted = videoTrack.muted

    log('📹 Video track state:', {
      readyState: trackState,
      enabled: trackEnabled,
      muted: trackMuted,
      label: videoTrack.label,
    })

    // Verify track is active and ready
    if (trackState !== 'live') {
      throw new Error(
        `Video track not ready. State: ${trackState}. Track may have been stopped or camera disconnected.`,
      )
    }

    if (!trackEnabled) {
      throw new Error('Video track is disabled')
    }

    if (trackMuted) {
      logWarn('⚠️  Video track is muted - this may affect capture quality')
    }

    // Check if ImageCapture API is supported
    if (typeof ImageCapture === 'undefined') {
      throw new TypeError('ImageCapture API not supported in this browser')
    }

    // Create ImageCapture instance
    const imageCapture = new ImageCapture(videoTrack) as ExtendedImageCapture

    // Get photo capabilities
    const capabilities = videoTrack.getCapabilities()
    const settings = videoTrack.getSettings()

    log('📹 Video track info:', {
      readyState: videoTrack.readyState,
      capabilities: {
        width: capabilities.width,
        height: capabilities.height,
      },
      currentSettings: {
        width: settings.width,
        height: settings.height,
      },
    })

    // Get high-res config from module options
    const captureResolution = moduleOptions.camera?.captureResolution

    // Capture high-resolution photo with retry logic
    const captureStart = performance.now()
    const blob = await capturePhotoWithRetry(imageCapture, captureResolution)
    const captureTime = performance.now() - captureStart

    log(`⚡ Total photo capture time: ${captureTime.toFixed(1)}ms`)

    // Convert blob to Image
    const img = new Image()
    const imageUrl = URL.createObjectURL(blob)

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Failed to load image from blob'))
      img.src = imageUrl
    })

    // Get actual captured resolution
    const highResWidth = img.width
    const highResHeight = img.height

    log('📹 Resolution comparison:', {
      preview: `${previewWidth}x${previewHeight}`,
      captured: `${highResWidth}x${highResHeight}`,
      scale: `${(highResWidth / previewWidth).toFixed(2)}x`,
    })

    // Verify we got a high-resolution image
    if (
      highResWidth < previewWidth * 0.9 ||
      highResHeight < previewHeight * 0.9
    ) {
      logWarn(
        '⚠️  Captured resolution is lower than preview - this may indicate a camera limitation',
      )
    }

    // Create canvas to convert image to ImageData
    const canvas = document.createElement('canvas')
    canvas.width = highResWidth
    canvas.height = highResHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      throw new Error('Failed to get canvas context')
    }

    ctx.drawImage(img, 0, 0)
    const rgba = ctx.getImageData(0, 0, highResWidth, highResHeight)

    // Clean up
    URL.revokeObjectURL(imageUrl)

    log('📷 ImageData extracted:', `${rgba.width}x${rgba.height}`)

    // Scale quad from preview resolution to captured resolution
    const scaleX = highResWidth / previewWidth
    const scaleY = highResHeight / previewHeight
    const scaledQuad = previewQuad.map((coord, idx) =>
      idx % 2 === 0 ? coord * scaleX : coord * scaleY,
    )

    log('📐 Quad scaling:', {
      preview: `${previewWidth}x${previewHeight}`,
      captured: `${highResWidth}x${highResHeight}`,
      scaleX: scaleX.toFixed(3),
      scaleY: scaleY.toFixed(3),
      previewQuad: previewQuad.map((c) => Math.round(c)),
      scaledQuad: scaledQuad.map((c) => Math.round(c)),
    })

    // Warp document at high resolution
    const warpStart = performance.now()
    const doc = await scanner.captureDocument(rgba, scaledQuad, 1500)
    const warpTime = performance.now() - warpStart

    log(`⚡ Document warping completed in ${warpTime.toFixed(1)}ms`)

    if (doc) {
      thumbnail.value = doc.thumbnail
      emit('capture', doc.warped!)
      log(
        '✅ High-res document captured successfully',
        doc.id,
        `Input: ${rgba.width}x${rgba.height}`,
        `Output: ${doc.warped?.width}x${doc.warped?.height}`,
        `Total time: ${(performance.now() - captureStart).toFixed(1)}ms`,
      )
    } else {
      throw new Error('Document warping failed - no document returned')
    }
  } catch (error) {
    logError('❌ High-resolution capture failed:', error)
    // Don't fallback - let it fail so we can see the actual error
    // This helps identify and fix issues rather than hiding them
    throw error
  } finally {
    // Reset auto-capture and capturing flag
    cancelAutoCapture()
    isCapturing.value = false

    // Restart detection loop
    log('▶️  Restarting detection loop...')
    scanner.start()
    if (!animationFrameId) {
      lastFpsUpdate = performance.now()
      animationFrameId = requestAnimationFrame(loop)
    }

    // Mark last capture time to prevent immediate re-trigger
    lastCaptureAt.value = performance.now()
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
async function handleSave() {
  emit('save', scanner.documents.value)
  scanner.clearDocuments()
  stopLoop()
  cancelAutoCapture()

  // Stop camera stream immediately when closing
  try {
    await cameraRef.value?.stop?.()
  } catch (e) {
    logWarn('Camera stop failed during close:', e)
  }
}

/**
 * Watch for stability to trigger auto-capture
 */
watch(isStable, (stable) => {
  if (!autoCaptureEnabled.value) return

  if (stable && isCamera.value) {
    // Debounce after a capture
    const now = performance.now()
    const cooldownMs = 1200
    if (now - lastCaptureAt.value < cooldownMs) {
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

  // Ensure camera stream is stopped on unmount
  try {
    await cameraRef.value?.stop?.()
  } catch (e) {
    logWarn('Camera stop failed during unmount:', e)
  }

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
  text-align: center;
  white-space: nowrap;
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
