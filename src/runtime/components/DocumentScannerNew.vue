<template>
  <div class="nuxt-document-scanner">
    <video ref="video" class="nuxt-document-scanner-video" muted playsinline />
    <canvas ref="overlay" class="nuxt-document-scanner-overlay" />
    <DocumentScannerTopControl
      v-show="showTopControls && (isCamera || isHeatmaps)"
      :mode="mode"
      @mode-switch="mode = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DocumentScannerProps, DocumentScannerMode } from '../types'
import { useScanner } from '../composables/useScanner'

const video = ref<HTMLVideoElement>()
const overlay = ref<HTMLCanvasElement>()

const mode = defineModel<DocumentScannerMode>('mode', {
  default: 'camera',
})
useScanner({
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
})

// Props
withDefaults(defineProps<DocumentScannerProps>(), {
  showTopControls: true,
})

// Emits
// const emit = defineEmits<{
//   close: []
//   save: [document: Document[]]
// }>()

const isCamera = computed(() => mode.value === 'camera')
const isHeatmaps = computed(() => mode.value === 'heatmaps')
</script>

<style scoped>
.nuxt-document-scanner {
  width: 100%;
  height: 100vh;
  height: 100dvh;
}
.nuxt-document-scanner-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #0b0f14;
  position: absolute;
  top: 0;
  left: 0;
}
.nuxt-document-scanner-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
