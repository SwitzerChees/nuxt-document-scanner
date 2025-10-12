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
      @close="emit('close')"
    />
    <DocumentScannerPreview
      v-show="isPreview"
      :images="previewImages"
      @back="mode = 'camera'"
      @save="save"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRaw, watch } from 'vue'
import type {
  DocumentScannerProps,
  DocumentScannerMode,
  Document,
  DeepRequired,
} from '../types'
import { useDocumentScanner } from '../composables/useDocumentScanner'
import DocumentScannerControls from './DocumentScannerControls.vue'
import DocumentScannerPreview from './DocumentScannerPreview.vue'
import { useRuntimeConfig } from '#imports'
import type { DocumentScannerModuleOptions } from '~/src/module'

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

const config = useRuntimeConfig()

// as type but nothing is optional
const moduleOptions = toRaw(
  config.public.documentScanner,
) as DeepRequired<DocumentScannerModuleOptions>

const scanner = useDocumentScanner({
  ...moduleOptions,
  overlay,
  videoOptions: { ...moduleOptions.videoOptions, video: video },
})

const save = () => {
  if (!scanner.currentDocument.value) return
  emit('save', scanner.currentDocument.value)
  emit('close')
}

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
  autoStart: true,
})

// Emits
const emit = defineEmits<{
  close: []
  save: [document: Document]
}>()

onMounted(() => {
  if (props.autoStart) {
    startScanner()
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
  z-index: 10000;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  display: flex;
  position: fixed;
  inset: 0;
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
