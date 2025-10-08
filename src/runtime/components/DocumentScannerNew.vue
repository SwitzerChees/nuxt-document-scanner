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
import type {
  DocumentScannerProps,
  Document,
  DocumentScannerMode,
} from '../types'
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
})

// Props
const props = withDefaults(defineProps<DocumentScannerProps>(), {
  showTopControls: true,
})

// Emits
const emit = defineEmits<{
  close: []
  save: [document: Document[]]
}>()

const isCamera = computed(() => mode.value === 'camera')
const isPreview = computed(() => mode.value === 'preview')
const isHeatmaps = computed(() => mode.value === 'heatmaps')
</script>

<style scoped>
.nuxt-document-scanner {
  width: 100%;
  height: 100%;
  background-color: #943b3b;
}
.nuxt-document-scanner-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #0b0f14;
  position: absolute;
  top: 0;
  left: 0;
}
.nuxt-document-scanner-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  width: 100%;
  height: 100%;
}
</style>
