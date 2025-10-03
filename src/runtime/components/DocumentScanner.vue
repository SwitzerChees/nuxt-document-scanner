<template>
  <ClientOnly>
    <div class="document-scanner">
      <div class="scanner-stage">
        <div class="scanner-surface">
          <DocumentScannerCamera v-show="isCamera" ref="cameraRef" />
          <DocumentScannerOverlay
            v-show="isCamera"
            ref="overlayRef"
            :quad="displayQuad"
            :detected="quadDetected"
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
          v-show="showTopControls && isCamera"
          :mode="mode"
        />

        <DocumentScannerControl
          class="scanner-controls"
          :thumbnail="thumbnail"
          :can-capture="quadDetected && !isInitializing"
          @close="handleClose"
          @capture="handleCapture"
          @open-preview="handleOpenPreview"
        />

        <!-- Loading indicator -->
        <div v-if="isInitializing" class="loading-indicator">
          <div class="loading-spinner" />
          <div class="loading-text">
            Initializing scanner...
          </div>
        </div>
      </div>
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRuntimeConfig } from '#imports'
import { useDocumentScanner } from '../composables/useDocumentScanner'
import { grabRGBA } from '../utils/image-processing'
import type { ModuleOptions } from '../../module'

// Props
const props = withDefaults(
  defineProps<{
    mode?: 'camera' | 'preview'
    showTopControls?: boolean
    modelPath?: string
    defaultName?: string
  }>(),
  {
    mode: 'camera',
    showTopControls: true,
    defaultName: 'Scanned document',
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
const moduleOptions = (config.public.documentScanner || {}) as ModuleOptions

// Component refs
const cameraRef = ref<any>()
const overlayRef = ref<any>()

// Mode state
const mode = ref(props.mode)
const isCamera = computed(() => mode.value === 'camera')
const isPreview = computed(() => mode.value === 'preview')
const showTopControls = ref(props.showTopControls)

// Get model path
const modelPath = computed(() => {
  if (props.modelPath) return props.modelPath

  const version = moduleOptions.model?.version || 'tiny'
  const name = moduleOptions.model?.name || 'pidinet'
  return `/models/${name}_${version}.onnx`
})

// Scanner composable
const scanner = useDocumentScanner({
  modelPath: modelPath.value,
  preferExecutionProvider: moduleOptions.inference?.prefer || 'wasm',
  targetResolution: moduleOptions.inference?.targetResolution || 384,
  mobileResolution: moduleOptions.inference?.mobileResolution || 256,
  edgeThreshold: moduleOptions.edgeDetection?.threshold || 0.5,
  edgeDetectionParams: {
    houghThreshold: moduleOptions.edgeDetection?.houghThreshold || 50,
    minLineLength: moduleOptions.edgeDetection?.minLineLength || 50,
    maxLineGap: moduleOptions.edgeDetection?.maxLineGap || 10,
    minAreaPercent: moduleOptions.edgeDetection?.minAreaPercent || 0.03,
  },
  smoothingAlpha: moduleOptions.edgeDetection?.smoothingAlpha || 0.3,
  onReady: () => {
    console.log('✅ Document scanner ready')
    isInitializing.value = false
    startLoop()
  },
  onError: (error) => {
    console.error('❌ Scanner error:', error)
  },
})

// Detection state
const displayQuad = ref<number[]>()
const quadDetected = computed(() => scanner.detectionStats.value.quadDetected)
const thumbnail = ref<string>()
const isInitializing = ref(true)

// Preview state
const previewImages = computed(() =>
  scanner.documents.value.map((doc) => doc.thumbnail || ''),
)

// Main loop state
let animationFrameId: number | undefined
let frameCount = 0
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
  const videoElement = cameraRef.value?.video

  if (videoElement && videoElement.readyState >= 2 && scanner.isInitialized.value) {
    try {
      // Process frame
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

          // Scale quad from video to display coordinates
          displayQuad.value = result.quadSmoothed.map((coord, idx) => {
            if (idx % 2 === 0) {
              return coord * displayScale + offsetX
            } else {
              return coord * displayScale + offsetY
            }
          })
        }
      } else {
        displayQuad.value = undefined
      }

      // Update FPS
      frameCount++
      if (now - lastFpsUpdate >= 1000) {
        scanner.fps.value = Math.round(
          (frameCount * 1000) / (now - lastFpsUpdate),
        )
        frameCount = 0
        lastFpsUpdate = now
      }
    } catch (error) {
      console.error('Loop error:', error)
    }
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
function modeSwitch(newMode: 'camera' | 'preview') {
  mode.value = newMode
  if (newMode === 'camera') {
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
 * Handle capture
 */
function handleCapture() {
  if (!quadDetected.value || !scanner.lastQuad.value) return

  const videoElement = cameraRef.value?.video
  if (!videoElement) return

  // Capture high-res frame
  const rgba = grabRGBA(videoElement)
  if (!rgba) return

  // Capture document with current quad
  const doc = scanner.captureDocument(rgba, scanner.lastQuad.value, 1000)

  if (doc) {
    thumbnail.value = doc.thumbnail
    emit('capture', doc.warped!)
    console.log('📸 Document captured:', doc.id)
  }
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
  to { transform: rotate(360deg); }
}

.loading-text {
  color: #e5e7eb;
  font-size: 14px;
  font-weight: 500;
}
</style>
