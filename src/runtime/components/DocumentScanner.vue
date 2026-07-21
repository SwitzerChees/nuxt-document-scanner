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
      <div
        v-if="!isPreview"
        class="nuxt-document-scanner-status"
        role="status"
        aria-live="polite"
      >
        <span
          class="nuxt-document-scanner-status-dot"
          :class="{ 'is-ready': isStable }"
        />
        <span>{{ statusText }}</span>
      </div>
      <div
        v-if="!isPreview && activeError"
        class="nuxt-document-scanner-error"
        role="alert"
      >
        <p>{{ activeError.message }}</p>
        <button
          v-if="activeError.recoverable"
          type="button"
          @click="retryScanner"
        >
          Retry
        </button>
      </div>
      <div
        v-if="!isPreview && isBusy"
        class="nuxt-document-scanner-capture-state"
        role="status"
        aria-live="assertive"
      >
        <span class="nuxt-document-scanner-spinner" aria-hidden="true" />
        <span>{{ captureStatusText }}</span>
      </div>
    </div>
    <div
      v-if="showCaptureFlash"
      class="nuxt-document-scanner-capture-flash"
      aria-hidden="true"
    />
    <DocumentScannerControls
      v-show="!isPreview"
      :tracks="tracks"
      :capture-progress="autoCaptureProgress"
      :auto-capture-delay="autoCaptureDelay"
      :thumbnail="thumbnail"
      :page-count="pageCount"
      class="nuxt-document-scanner-controls"
      :is-stable="isStable"
      :is-camera-ready="isStarted"
      :is-busy="isBusy"
      :active-device-id="selectedDeviceId"
      @open-preview="mode = 'preview'"
      @change-track="selectTrack"
      @capture="requestCapture"
      @close="closeScanner"
    />
    <DocumentScannerPreview
      v-if="isPreview"
      :images="previewImages"
      :page-count="pageCount"
      :default-file-name="defaultFileName"
      :is-saving="isSavingPdf"
      :save-error="pdfError"
      @back="mode = 'camera'"
      @delete="removePage"
      @save="savePdf"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRaw, watch } from 'vue'
import type {
  DocumentScannerProps,
  DocumentScannerMode,
  Document,
  DocumentPdfOutput,
  DeepRequired,
  DocumentScannerModuleOptions,
} from '../types'
import { useDocumentScanner } from '../composables/useDocumentScanner'
import DocumentScannerControls from './DocumentScannerControls.vue'
import DocumentScannerPreview from './DocumentScannerPreview.vue'
import { useRuntimeConfig } from '#imports'
import { createPdfFromDocument } from '../utils/pdf'

const video = ref<HTMLVideoElement>()
const overlay = ref<HTMLCanvasElement>()

// Props
const props = withDefaults(defineProps<DocumentScannerProps>(), {
  autoStart: true,
})

// Emits
const emit = defineEmits<{
  close: []
  save: [document: Document]
  pdf: [output: DocumentPdfOutput]
}>()

const thumbnail = computed(() => {
  return scanner.currentDocument.value?.pages[
    scanner.currentDocument.value?.pages.length - 1
  ]?.thumbnail
})

const previewImages = computed(() => {
  return scanner.currentDocument.value?.pages.map((page) => page.thumbnail!)
})

const pageCount = computed(() => scanner.currentDocument.value?.pages.length || 0)
const isSavingPdf = ref(false)
const pdfError = ref<string>()

const formatTimestamp = (date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + '-' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('-')
}

const defaultFileName = computed(() => {
  return props.fileName || `scan-${formatTimestamp()}.pdf`
})

const statusText = computed(() => {
  if (isPreview.value) return `${pageCount.value} pages ready`
  if (state.value === 'requesting-permission') return 'Allow camera access'
  if (state.value === 'detector-loading') return 'Camera ready · Loading edges'
  if (captureState.value === 'success') return 'Page captured'
  if (lastError.value?.code === 'detector-load') return 'Manual capture available'
  if (lastError.value) return 'Camera unavailable'
  if (!isStarted.value) return 'Starting camera'
  if (isStable.value) return 'Ready to capture'
  return isDetectorReady.value ? 'Align all four edges' : 'Manual capture available'
})

const captureStatusText = computed(() =>
  captureState.value === 'processing' ? 'Processing page' : 'Capturing page',
)

const activeError = computed(() => captureError.value || lastError.value)

const mode = defineModel<DocumentScannerMode>('mode', {
  default: 'camera',
})
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

const isPreview = computed(() => mode.value === 'preview')

const save = () => {
  if (!scanner.currentDocument.value) return
  emit('save', scanner.currentDocument.value)
  emit('close')
}

const closeScanner = () => {
  stopScanner()
  emit('close')
}

const getErrorMessage = (value: unknown) => {
  if (value instanceof Error) return value.message
  if (value instanceof Event) return 'PDF export failed.'
  return String(value || 'PDF export failed.')
}

const savePdf = async (fileName?: string) => {
  if (!scanner.currentDocument.value || !pageCount.value || isSavingPdf.value) {
    return
  }
  isSavingPdf.value = true
  pdfError.value = undefined

  try {
    const pdf = await createPdfFromDocument(scanner.currentDocument.value, {
      fileName: fileName || defaultFileName.value,
      pageSize: 'a4',
    })
    emit('pdf', pdf)
    save()
  } catch (error) {
    pdfError.value = getErrorMessage(error)
  } finally {
    isSavingPdf.value = false
  }
}

const {
  tracks,
  selectedDeviceId,
  isStable,
  isStarted,
  isDetectorReady,
  isBusy,
  state,
  captureState,
  lastError,
  captureError,
  startScanner,
  pauseScanner,
  resumeScanner,
  retryScanner,
  stopScanner,
  createNewDocument,
  removePage,
  selectTrack,
  autoCaptureProgress,
  autoCaptureDelay,
  requestCapture,
  showCaptureFlash,
} = scanner

onMounted(() => {
  if (props.autoStart) {
    startScanner()
  }
})

onUnmounted(() => {
  stopScanner()
})

watch(
  () => isPreview.value,
  (newIsPreview) => {
    if (newIsPreview) {
      pauseScanner()
    } else {
      void resumeScanner()
    }
  },
)

defineExpose({
  startScanner,
  retryScanner,
  stopScanner,
  createNewDocument,
  savePdf,
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
  background: #080a0c;
}
.nuxt-document-scanner-stream {
  position: relative;
  flex: 1;
  min-height: 0;
}
.nuxt-document-scanner-video {
  object-fit: cover;
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
.nuxt-document-scanner-status {
  position: absolute;
  top: calc(env(safe-area-inset-top) + 14px);
  left: 50%;
  z-index: 2;
  display: inline-flex;
  min-height: 38px;
  max-width: calc(100% - 32px);
  transform: translateX(-50%);
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  background: rgba(7, 10, 12, 0.64);
  padding: 9px 13px;
  color: #f5f7f2;
  font: 700 12px/1.2 ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  backdrop-filter: blur(16px);
}
.nuxt-document-scanner-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #f6b942;
  box-shadow: 0 0 0 4px rgba(246, 185, 66, 0.16);
}
.nuxt-document-scanner-status-dot.is-ready {
  background: #77d977;
  box-shadow: 0 0 0 4px rgba(119, 217, 119, 0.16);
}
.nuxt-document-scanner-error {
  position: absolute;
  right: 16px;
  bottom: 16px;
  left: 16px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  background: rgba(120, 23, 23, 0.72);
  padding: 12px 14px;
  color: #fff5f1;
  font: 600 13px/1.35 ui-sans-serif, system-ui, sans-serif;
  backdrop-filter: blur(14px);
}
.nuxt-document-scanner-error p {
  flex: 1;
  margin: 0;
}
.nuxt-document-scanner-error button {
  min-width: 72px;
  min-height: 44px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.12);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.nuxt-document-scanner-capture-state {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 14px;
  pointer-events: none;
  background: rgba(7, 10, 12, 0.28);
  color: #f7f3ea;
  font: 800 13px/1.2 ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  backdrop-filter: blur(2px);
}
.nuxt-document-scanner-spinner {
  width: 38px;
  height: 38px;
  border: 3px solid rgba(255, 255, 255, 0.24);
  border-top-color: #77d977;
  border-radius: 999px;
  animation: nuxt-document-scanner-spin 720ms linear infinite;
}
.nuxt-document-scanner-controls {
  flex: 0 0 auto;
}
.nuxt-document-scanner-capture-flash {
  position: fixed;
  inset: 0;
  z-index: 2147483637;
  pointer-events: none;
  background: #fffef5;
  animation: nuxt-document-scanner-capture-flash-in 140ms ease-out both;
}
@keyframes nuxt-document-scanner-capture-flash-in {
  0% {
    opacity: 0;
  }
  20% {
    opacity: 0.98;
  }
  100% {
    opacity: 0;
  }
}
@keyframes nuxt-document-scanner-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .nuxt-document-scanner-spinner {
    animation-duration: 1.8s;
  }
  .nuxt-document-scanner-capture-flash {
    animation: none;
    opacity: 0.34;
  }
}
</style>
