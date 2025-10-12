<template>
  <div class="nuxt-document-scanner">
    <div class="nuxt-document-scanner-stream">
      <video
        ref="video"
        class="nuxt-document-scanner-video"
        muted
        playsinline
      />
      <canvas ref="overlay" class="nuxt-document-scanner-overlay" />
    </div>
    <DocumentScannerControls
      v-show="!isPreview"
      :tracks="tracks"
      :capture-progress="autoCaptureProgress"
      :auto-capture-delay="autoCaptureDelay"
      :thumbnail="thumbnail"
      class="nuxt-document-scanner-controls"
      :is-stable="isStable"
      @open-preview="mode = 'preview'"
      @capture="captureRequested = true"
    />
    <DocumentScannerPreview
      v-show="isPreview"
      :images="previewImages"
      @back="mode = 'camera'"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { DocumentScannerProps, DocumentScannerMode } from '../types'
import { useDocumentScanner } from '../composables/useDocumentScanner'
import DocumentScannerControls from './DocumentScannerControls.vue'
import DocumentScannerPreview from './DocumentScannerPreview.vue'

const video = ref<HTMLVideoElement>()
const overlay = ref<HTMLCanvasElement>()

const thumbnail = computed(() => {
  return scanner.currentDocument.value?.pages[
    scanner.currentDocument.value?.pages.length - 1
  ]?.thumbnail
})

const previewImages = computed(() => {
  return scanner.currentDocument.value?.pages.map((page) => page.thumbnail!)
})

const mode = defineModel<DocumentScannerMode>('mode', {
  default: 'camera',
})
watch(
  () => mode.value,
  (newMode) => {
    if (newMode === 'camera' && isStarted.value) {
      startScanner()
    } else {
      stopScanner()
    }
  },
)

const scanner = useDocumentScanner({
  videoOptions: {
    video,
    resizeDelay: 500,
    facingMode: 'environment',
    resolution: 1920,
  },
  overlay,
  opencvUrl: '/nuxt-document-scanner/opencv/opencv-4.8.0.js',
  worker: {
    modelPath: '/nuxt-document-scanner/models/lcnet100_h_e_bifpn_256_fp32.onnx',
    onnxPath: '/nuxt-document-scanner/onnx/',
    modelResolution: 256,
    prefer: 'webgpu',
    inputName: 'img',
  },
  capture: {
    autoCapture: {
      enabled: true,
      delay: 1000,
      cooldown: 2500,
    },
    stableDuration: 1800,
    stableSignificantMotionThreshold: 0.3,
    stableMotionThreshold: 0.3,
    maxMissedRectangles: 6,
  },
})

const {
  tracks,
  isStable,
  isStarted,
  startScanner,
  stopScanner,
  createNewDocument,
  autoCaptureProgress,
  autoCaptureDelay,
  captureRequested,
} = scanner

// Props
const props = withDefaults(defineProps<DocumentScannerProps>(), {
  showTopControls: true,
  autoStart: true,
})

// Emits
defineEmits<{
  close: []
  save: [document: Document]
}>()

onMounted(() => {
  if (props.autoStart) {
    setTimeout(() => {
      startScanner()
    }, 100)
  }
})

onUnmounted(() => {
  stopScanner()
})

const isPreview = computed(() => mode.value === 'preview')
watch(
  () => isPreview.value,
  (newIsPreview) => {
    if (newIsPreview) {
      stopScanner()
    } else {
      startScanner()
    }
  },
)

defineExpose({
  startScanner,
  stopScanner,
  createNewDocument,
})
</script>

<style scoped>
.nuxt-document-scanner {
  width: 100%;
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #0e1010;
}
.nuxt-document-scanner-stream {
  position: relative;
  flex: 1;
}
.nuxt-document-scanner-video {
  object-fit: contain;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
.nuxt-document-scanner-overlay {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  width: 100%;
  height: 100%;
}
.nuxt-document-scanner-controls {
  flex: 1;
  max-height: 180px;
}
</style>
