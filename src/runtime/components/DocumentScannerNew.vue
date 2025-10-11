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
      class="nuxt-document-scanner-controls"
      :is-stable="isStable"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DocumentScannerProps, DocumentScannerMode } from '../types'
import { useScanner } from '../composables/useScanner'
import DocumentScannerControls from './DocumentScannerControls.vue'

const video = ref<HTMLVideoElement>()
const overlay = ref<HTMLCanvasElement>()

const mode = defineModel<DocumentScannerMode>('mode', {
  default: 'camera',
})
const scanner = useScanner({
  video,
  videoOptions: { resizeDelay: 500, facingMode: 'environment' },
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
    autoCapture: true,
    stableDuration: 1000,
    stableSignificantMotionThreshold: 0.3,
    stableMotionThreshold: 0.2,
    maxMissedRectangles: 6,
    delay: 500,
  },
})

const { tracks, isStable } = scanner

// Props
withDefaults(defineProps<DocumentScannerProps>(), {
  showTopControls: true,
})

// Emits
// const emit = defineEmits<{
//   close: []
//   save: [document: Document[]]
// }>()

const isPreview = computed(() => mode.value === 'preview')
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
