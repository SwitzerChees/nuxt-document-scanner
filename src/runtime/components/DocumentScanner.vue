<template>
  <div
    ref="scannerRoot"
    class="nuxt-document-scanner"
    :style="themeStyle"
    role="dialog"
    aria-modal="true"
    :aria-label="messages.scannerLabel"
    tabindex="-1"
    @keydown="trapScannerFocus"
    @keydown.esc="onScannerEscape"
  >
    <div ref="streamContainer" class="nuxt-document-scanner-stream">
      <video
        ref="video"
        class="nuxt-document-scanner-video"
        :style="{ objectFit: previewObjectFit }"
        autoplay
        muted
        playsinline
        webkit-playsinline
        disablepictureinpicture
        @loadedmetadata="updatePreviewFit"
        @resize="updatePreviewFit"
      />
      <canvas ref="overlay" class="nuxt-document-scanner-overlay" />
      <slot
        v-if="!isPreview"
        name="status"
        :state="state"
        :text="statusText"
        :quality="currentQuality"
        :is-stable="isStable"
      >
        <div
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
      </slot>
      <div
        v-if="!isPreview && activeError"
        class="nuxt-document-scanner-error"
        role="alert"
      >
        <p>{{ activeErrorText }}</p>
        <button
          v-if="activeError.recoverable"
          type="button"
          @click="retryScanner"
        >
          {{ messages.retry }}
        </button>
        <button type="button" @click="photoInput?.click()">
          {{ messages.importPhoto }}
        </button>
        <input
          ref="photoInput"
          class="nuxt-document-scanner-visually-hidden"
          type="file"
          accept="image/*"
          tabindex="-1"
          aria-hidden="true"
          @change="importSelectedPhoto"
        />
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
    <slot
      v-if="!isPreview"
      name="controls"
      :scanner="scanner"
      :close="requestClose"
      :open-preview="openPreview"
    >
      <DocumentScannerControls
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
        :messages="messages"
        @open-preview="mode = 'preview'"
        @change-track="selectTrack"
        @capture="requestCapture"
        @close="requestClose"
      />
    </slot>
    <DocumentScannerPreview
      v-if="isPreview"
      :pages="scanner.currentDocument.value?.pages"
      :default-file-name="defaultFileName"
      :is-saving="isSavingPdf"
      :is-processing="isProcessingCapture"
      :can-undo-delete="canUndoDelete"
      :save-error="pdfError"
      :messages="messages"
      :export-ui="props.exportUi"
      @back="mode = 'camera'"
      @delete="removePage"
      @undo-delete="undoRemovePage"
      @rotate="rotatePage"
      @profile="updatePageProfile"
      @crop="updatePageQuad"
      @retake="retakePage"
      @reorder="reorderPage"
      @save="savePdf"
      @complete="save"
    />
    <div
      v-if="isDiscardDialogOpen"
      class="nuxt-document-scanner-dialog-backdrop"
      @click.self="isDiscardDialogOpen = false"
    >
      <div
        class="nuxt-document-scanner-discard-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="discard-dialog-title"
      >
        <h2 id="discard-dialog-title">{{ messages.discardTitle }}</h2>
        <p>{{ messages.discardBody }}</p>
        <div>
          <button type="button" @click="isDiscardDialogOpen = false">{{ messages.keepScanning }}</button>
          <button type="button" class="is-danger" @click="confirmClose">{{ messages.discardPages }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, toRaw, watch } from 'vue'
import type {
  DocumentScannerProps,
  DocumentScannerMode,
  Document,
  DocumentPdfOutput,
  DocumentPage,
  QualityAssessment,
  ScannerError,
  ScannerState,
  DeepRequired,
  DocumentScannerModuleOptions,
} from '../types'
import { useDocumentScanner } from '../composables/useDocumentScanner'
import DocumentScannerControls from './DocumentScannerControls.vue'
import DocumentScannerPreview from './DocumentScannerPreview.vue'
import { useRuntimeConfig } from '#imports'
import { createPdfFromDocument } from '../utils/pdf'
import { DEFAULT_SCANNER_MESSAGES } from '../utils/messages'
import { resolvePreviewObjectFit, type VideoObjectFit } from '../utils/overlay'

const video = ref<HTMLVideoElement>()
const overlay = ref<HTMLCanvasElement>()
const scannerRoot = ref<HTMLElement>()
const streamContainer = ref<HTMLElement>()
const photoInput = ref<HTMLInputElement>()
const isDiscardDialogOpen = ref(false)
const previewObjectFit = ref<Extract<VideoObjectFit, 'contain' | 'cover'>>('cover')
let previouslyFocused: HTMLElement | null = null
let streamResizeObserver: ResizeObserver | undefined
let restorePageStyles: (() => void) | undefined
let inertedSiblings: Array<{
  element: HTMLElement
  inert: boolean
  ariaHidden: string | null
}> = []

// Props
const props = withDefaults(defineProps<DocumentScannerProps>(), {
  autoStart: true,
  reviewAfterCapture: 'quality-warning',
  keepSource: true,
  exportUi: true,
})
const messages = computed(() => ({
  ...DEFAULT_SCANNER_MESSAGES,
  ...props.messages,
}))
const themeStyle = computed(() => {
  const theme = props.theme
  if (!theme) return undefined
  return Object.fromEntries(
    Object.entries(theme).map(([name, value]) => [`--nds-${name}`, value]),
  )
})

const updatePreviewFit = () => {
  const element = video.value
  const container = streamContainer.value
  if (!element || !container) return
  previewObjectFit.value = resolvePreviewObjectFit(
    element.videoWidth,
    element.videoHeight,
    container.clientWidth,
    container.clientHeight,
  )
}

const lockPageViewport = () => {
  const rootStyle = document.documentElement.style
  const bodyStyle = document.body.style
  const previous = {
    rootOverflow: rootStyle.overflow,
    rootOverscrollBehavior: rootStyle.overscrollBehavior,
    bodyOverflow: bodyStyle.overflow,
    bodyOverscrollBehavior: bodyStyle.overscrollBehavior,
    bodyTouchAction: bodyStyle.touchAction,
  }
  rootStyle.overflow = 'hidden'
  rootStyle.overscrollBehavior = 'none'
  bodyStyle.overflow = 'hidden'
  bodyStyle.overscrollBehavior = 'none'
  bodyStyle.touchAction = 'none'
  restorePageStyles = () => {
    rootStyle.overflow = previous.rootOverflow
    rootStyle.overscrollBehavior = previous.rootOverscrollBehavior
    bodyStyle.overflow = previous.bodyOverflow
    bodyStyle.overscrollBehavior = previous.bodyOverscrollBehavior
    bodyStyle.touchAction = previous.bodyTouchAction
  }
}

// Emits
const emit = defineEmits<{
  close: []
  save: [document: Document]
  complete: [document: Document]
  pdf: [output: DocumentPdfOutput]
  statechange: [state: ScannerState]
  qualitychange: [quality: QualityAssessment | undefined]
  pagecaptured: [page: DocumentPage]
  pageupdated: [page: DocumentPage]
  error: [error: ScannerError]
}>()

const thumbnail = computed(() => {
  return scanner.currentDocument.value?.pages[
    scanner.currentDocument.value?.pages.length - 1
  ]?.thumbnailUrl
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
  if (isPreview.value) return `${pageCount.value} ${messages.value.pagesReady}`
  if (state.value === 'requesting-permission') return messages.value.allowCamera
  if (state.value === 'detector-loading') return messages.value.loadingEdges
  if (captureState.value === 'success') return messages.value.pageCaptured
  if (lastError.value?.code === 'detector-load') return messages.value.manualCapture
  if (lastError.value) return messages.value.cameraErrorStatus
  if (!isStarted.value) return messages.value.startingCamera
  const warning = currentQuality.value?.warnings[0]
  if (warning === 'move-closer') return messages.value.moveCloser
  if (warning === 'hold-still') return messages.value.holdStill
  if (warning === 'too-dark') return messages.value.addLight
  if (warning === 'glare') return messages.value.reduceGlare
  if (isStable.value) return messages.value.ready
  return isDetectorReady.value ? messages.value.alignEdges : messages.value.manualCapture
})

const captureStatusText = computed(() =>
  captureState.value === 'processing'
    ? messages.value.processingPage
    : messages.value.capturingPage,
)

const activeError = computed(() => captureError.value || lastError.value)
const activeErrorText = computed(() => {
  const scannerError = activeError.value
  if (!scannerError) return ''
  if (scannerError.code === 'permission-denied') return messages.value.permissionDenied
  if (scannerError.code === 'camera-not-found') return messages.value.cameraNotFound
  if (scannerError.code === 'camera-in-use') return messages.value.cameraInUse
  if (scannerError.code === 'insecure-context') return messages.value.insecureContext
  if (scannerError.code === 'camera-start') return messages.value.cameraUnavailable
  return scannerError.message
})

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
  keepSource: props.keepSource,
  capture: {
    ...moduleOptions.capture,
    processingProfile: props.defaultProfile || moduleOptions.capture.processingProfile,
  },
  videoOptions: { ...moduleOptions.videoOptions, video: video },
})

const isPreview = computed(() => mode.value === 'preview')
const openPreview = () => {
  mode.value = 'preview'
}

const save = () => {
  if (!scanner.currentDocument.value) return
  emit('save', scanner.currentDocument.value)
  emit('complete', scanner.currentDocument.value)
  closeScanner()
}

const closeScanner = () => {
  disposeScanner()
  emit('close')
}

const requestClose = () => {
  if (pageCount.value) {
    isDiscardDialogOpen.value = true
    nextTick(() => {
      scannerRoot.value
        ?.querySelector<HTMLElement>('.nuxt-document-scanner-discard-dialog button')
        ?.focus()
    })
    return
  }
  closeScanner()
}

const confirmClose = () => {
  isDiscardDialogOpen.value = false
  closeScanner()
}

const focusableSelector = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const trapScannerFocus = (event: KeyboardEvent) => {
  if (event.key !== 'Tab') return
  const elements = Array.from(
    scannerRoot.value?.querySelectorAll<HTMLElement>(focusableSelector) || [],
  ).filter((element) => element.offsetParent !== null)
  const first = elements[0]
  const last = elements.at(-1)
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

const onScannerEscape = (event: KeyboardEvent) => {
  const nestedDialog = (event.target as HTMLElement)?.closest('[role="dialog"], [role="alertdialog"]')
  if (nestedDialog && nestedDialog !== scannerRoot.value) return
  requestClose()
}

const retakePage = (pageIndex: number) => {
  if (requestRetakePage(pageIndex)) mode.value = 'camera'
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
  } catch (error) {
    pdfError.value = getErrorMessage(error)
  } finally {
    isSavingPdf.value = false
  }
}

const importSelectedPhoto = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const image = file?.slice(0, file.size, file.type)
  input.value = ''
  if (!image) return
  if (await scanner.importPage(image)) mode.value = 'preview'
}

const {
  tracks,
  selectedDeviceId,
  isStable,
  isStarted,
  isDetectorReady,
  currentQuality,
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
  disposeScanner,
  createNewDocument,
  removePage,
  selectTrack,
  autoCaptureProgress,
  autoCaptureDelay,
  requestCapture,
  importPage,
  showCaptureFlash,
  isProcessingCapture,
  canUndoDelete,
  undoRemovePage,
  rotatePage,
  updatePageProfile,
  updatePageQuad,
  reorderPage,
  requestRetakePage,
  cancelRetakePage,
} = scanner

onMounted(() => {
  previouslyFocused = document.activeElement as HTMLElement | null
  lockPageViewport()
  if (typeof ResizeObserver !== 'undefined' && streamContainer.value) {
    streamResizeObserver = new ResizeObserver(updatePreviewFit)
    streamResizeObserver.observe(streamContainer.value)
  }
  window.addEventListener('orientationchange', updatePreviewFit)
  window.visualViewport?.addEventListener('resize', updatePreviewFit)
  nextTick(() => {
    const root = scannerRoot.value
    root?.focus()
    if (!root?.parentElement) return
    inertedSiblings = Array.from(root.parentElement.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== root)
      .map((element) => ({
        element,
        inert: element.inert,
        ariaHidden: element.getAttribute('aria-hidden'),
      }))
    for (const entry of inertedSiblings) {
      entry.element.inert = true
      entry.element.setAttribute('aria-hidden', 'true')
    }
  })
  if (props.autoStart) {
    startScanner()
  }
})

onUnmounted(() => {
  disposeScanner()
  streamResizeObserver?.disconnect()
  window.removeEventListener('orientationchange', updatePreviewFit)
  window.visualViewport?.removeEventListener('resize', updatePreviewFit)
  restorePageStyles?.()
  restorePageStyles = undefined
  for (const entry of inertedSiblings) {
    entry.element.inert = entry.inert
    if (entry.ariaHidden === null) entry.element.removeAttribute('aria-hidden')
    else entry.element.setAttribute('aria-hidden', entry.ariaHidden)
  }
  inertedSiblings = []
  previouslyFocused?.focus()
})

watch(
  () => isPreview.value,
  (newIsPreview) => {
    if (newIsPreview) {
      cancelRetakePage()
      pauseScanner()
    } else {
      void resumeScanner()
    }
  },
)

watch(state, value => emit('statechange', value), { immediate: true })
watch(currentQuality, value => emit('qualitychange', value))
watch(activeError, (value, previous) => {
  if (value && value !== previous) emit('error', value)
})

const observedPages = new Map<string, number>()
watch(
  () => scanner.currentDocument.value?.pages.map(page => ({ page, timestamp: page.timestamp })) || [],
  entries => {
    const currentIds = new Set(entries.map(entry => entry.page.id))
    for (const id of observedPages.keys()) {
      if (!currentIds.has(id)) observedPages.delete(id)
    }
    for (const entry of entries) {
      const previousTimestamp = observedPages.get(entry.page.id)
      if (previousTimestamp === undefined) emit('pagecaptured', entry.page)
      else if (entry.timestamp !== previousTimestamp) emit('pageupdated', entry.page)
      observedPages.set(entry.page.id, entry.timestamp)
    }
  },
  { deep: true },
)

let reviewedPageVersion: string | undefined
watch(
  () => [
    captureState.value,
    scanner.currentDocument.value?.pages.reduce<DocumentPage | undefined>(
      (latest, page) => !latest || page.timestamp > latest.timestamp ? page : latest,
      undefined,
    ),
  ] as const,
  ([nextCaptureState, page]) => {
    const pageVersion = page ? `${page.id}:${page.timestamp}` : undefined
    if (nextCaptureState !== 'success' || !page || pageVersion === reviewedPageVersion) return
    reviewedPageVersion = pageVersion
    if (
      props.reviewAfterCapture === 'always' ||
      (props.reviewAfterCapture === 'quality-warning' && page.needsReview)
    ) {
      mode.value = 'preview'
    }
  },
  { flush: 'post' },
)

defineExpose({
  startScanner,
  retryScanner,
  stopScanner,
  disposeScanner,
  createNewDocument,
  importPage,
  savePdf,
})
</script>

<style scoped>
.nuxt-document-scanner {
  --nds-background: #080a0c;
  --nds-surface: #111416;
  --nds-text: #f7f3ea;
  --nds-accent: #77d977;
  --nds-warning: #f6b942;
  --nds-danger: #a6372c;
  --nds-radius: 8px;
  z-index: 2147483000;
  width: 100vw;
  max-width: 100vw;
  height: 100vh;
  height: 100svh;
  height: 100dvh;
  display: flex;
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  isolation: isolate;
  flex-direction: column;
  overflow: hidden;
  overscroll-behavior: none;
  background: var(--nds-background);
  transform: translateZ(0);
  -webkit-transform: translateZ(0);
}
.nuxt-document-scanner-stream {
  position: relative;
  z-index: 0;
  flex: 1;
  min-height: 0;
  isolation: isolate;
  overflow: hidden;
  background: #050607;
}
.nuxt-document-scanner-video {
  object-fit: cover;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  background: #050607;
}
.nuxt-document-scanner-overlay {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  pointer-events: none;
  width: 100%;
  height: 100%;
  transform: translateZ(0);
  -webkit-transform: translateZ(0);
}
.nuxt-document-scanner-status {
  position: absolute;
  top: calc(env(safe-area-inset-top) + 14px);
  left: 50%;
  z-index: 4;
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
  background: var(--nds-warning);
  box-shadow: 0 0 0 4px rgba(246, 185, 66, 0.16);
}
.nuxt-document-scanner-status-dot.is-ready {
  background: var(--nds-accent);
  box-shadow: 0 0 0 4px rgba(119, 217, 119, 0.16);
}
.nuxt-document-scanner-error {
  position: absolute;
  right: 16px;
  bottom: 16px;
  left: 16px;
  z-index: 4;
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
.nuxt-document-scanner-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}
.nuxt-document-scanner-capture-state {
  position: absolute;
  inset: 0;
  z-index: 5;
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
.nuxt-document-scanner-dialog-backdrop {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  background: rgba(4, 5, 6, 0.76);
  padding: 18px;
  backdrop-filter: blur(16px);
}
.nuxt-document-scanner-discard-dialog {
  width: min(100%, 420px);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  background: var(--nds-surface);
  padding: 20px;
  color: #f7f3ea;
}
.nuxt-document-scanner-discard-dialog h2 {
  margin: 0 0 8px;
  font-size: 22px;
}
.nuxt-document-scanner-discard-dialog p {
  margin: 0 0 18px;
  color: rgba(247, 243, 234, 0.72);
}
.nuxt-document-scanner-discard-dialog > div {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.nuxt-document-scanner-discard-dialog button {
  min-height: 48px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  font-weight: 800;
}
.nuxt-document-scanner-discard-dialog button.is-danger {
  border-color: rgba(233, 104, 89, 0.5);
  background: var(--nds-danger);
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
  position: relative;
  z-index: 6;
  flex: 0 0 auto;
  transform: translateZ(0);
  -webkit-transform: translateZ(0);
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
