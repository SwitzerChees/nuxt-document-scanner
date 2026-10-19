<template>
  <div class="scanner-controls">
    <div class="scanner-controls-top">
      <label
        v-if="tracks?.length"
        class="camera-switcher"
        :class="{ 'is-switching': isSwitchingCamera }"
        :aria-busy="isSwitchingCamera"
      >
        <IconCamera class="camera-label-icon" />
        <select
          :value="tracks[activeIndex]?.deviceId"
          :aria-label="copy.selectCamera"
          :disabled="isBusy || tracks.length < 2"
          @change="changeTrack"
        >
          <option v-for="camera in tracks" :key="camera.deviceId" :value="camera.deviceId">{{ camera.label }}</option>
        </select>
        <IconChevronRight class="camera-chevron" />
      </label>

      <div class="capture-options">
        <button class="icon-button auto-toggle" type="button" :aria-label="copy.autoCapture" :aria-pressed="autoCaptureEnabled" :disabled="isBusy" @click="$emit('toggle-auto')">Auto</button>
        <button v-if="torchSupported" class="icon-button" type="button" :aria-label="copy.flashlight" :aria-pressed="torchOn" :disabled="isBusy || !isCameraReady" @click="$emit('toggle-torch')"><IconFlashlight /></button>
      </div>
    </div>

    <div class="scanner-controls-row">
      <button
        class="tool-button"
        type="button"
        :aria-label="copy.close"
        @click="$emit('close')"
      >
        <IconClose />
      </button>

      <div class="shutter-anchor">
        <button
          class="shutter"
          :class="{
            'is-stable': isStable,
            'is-busy': isBusy,
            'is-disabled': !isCameraReady || isBusy,
          }"
          :disabled="!isCameraReady || isBusy"
          type="button"
          :aria-label="copy.capture"
          @click="$emit('capture')"
        >
          <span class="shutter-ring" />
          <span class="shutter-core" />
        </button>
        <div
          v-if="(captureProgress || 0) > 0 && (captureProgress || 0) < 1"
          class="countdown"
          aria-hidden="true"
        >
          <IconRing
            :circumference="circumference"
            :capture-progress="captureProgress"
          />
          <span class="countdown-value">{{ countdownValue }}</span>
        </div>
      </div>

      <button
        class="thumbnail"
        type="button"
        :aria-label="`${copy.openPreview} · ${pageCount || 0} ${pageCount === 1 ? copy.page : copy.pages}`"
        :disabled="!pageCount || isBusy"
        @click="$emit('open-preview')"
      >
        <div ref="thumbnailFrameRef" class="thumbnail-frame">
          <img v-if="thumbnail" :src="thumbnail" alt="" />
          <IconGallery v-else class="thumbnail-placeholder" />
        </div>
        <span v-if="pageCount" class="page-counter" aria-hidden="true">{{ pageCount }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { DocumentScannerCamera, DocumentScannerMessages } from '../types'
import IconFlashlight from './Icon/Flashlight.vue'
import IconClose from './Icon/Close.vue'
import IconGallery from './Icon/Gallery.vue'
import IconRing from './Icon/Ring.vue'
import IconChevronRight from './Icon/ChevronRight.vue'
import IconCamera from './Icon/Camera.vue'
import { DEFAULT_SCANNER_MESSAGES } from '../utils/messages'

const props = defineProps<{
  autoCaptureEnabled?: boolean
  torchSupported?: boolean
  torchOn?: boolean
  isStable?: boolean
  isCameraReady?: boolean
  isBusy?: boolean
  isSwitchingCamera?: boolean
  activeDeviceId?: string
  captureProgress?: number
  tracks?: DocumentScannerCamera[]
  autoCaptureDelay?: number
  thumbnail?: string | null
  pageCount?: number
  messages?: Partial<DocumentScannerMessages>
}>()

const copy = computed(() => ({
  ...DEFAULT_SCANNER_MESSAGES,
  ...props.messages,
}))

const emit = defineEmits<{
  (e: 'close' | 'capture' | 'open-preview' | 'toggle-auto' | 'toggle-torch'): void
  (e: 'change-track', track: DocumentScannerCamera): void
}>()

const circumference = computed(() => 2 * Math.PI * 54)
const activeIndex = ref(0)
const thumbnailFrameRef = ref<HTMLElement>()
let activeCanvas: HTMLCanvasElement | null = null
let lastThumbnailUrl: string | null = null

const countdownValue = computed(() => {
  const progress = props.captureProgress || 0
  if (progress <= 0 || progress >= 1) return 0
  return Math.max(
    1,
    Math.ceil(((1 - progress) * (props.autoCaptureDelay || 1400)) / 1000),
  )
})

const changeTrack = (event: Event) => {
  if (!props.tracks?.length || props.isBusy) return
  const track = props.tracks.find(camera => camera.deviceId === (event.target as HTMLSelectElement).value)
  if (track) emit('change-track', track)
}

watch(
  () => [props.tracks, props.activeDeviceId] as const,
  ([value, activeDeviceId]) => {
    if (!value?.length) return
    const selectedIndex = value.findIndex(
      (camera) => camera.deviceId === activeDeviceId,
    )
    if (selectedIndex >= 0) activeIndex.value = selectedIndex
    else if (activeIndex.value >= value.length) activeIndex.value = 0
  },
  { immediate: true },
)

watch(
  () => props.thumbnail,
  async (value) => {
    if (!value || value === lastThumbnailUrl) return
    lastThumbnailUrl = value
    await nextTick()
    void playCaptureEffect(value).catch(() => {})
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  if (activeCanvas?.isConnected) activeCanvas.remove()
  activeCanvas = null
})

async function playCaptureEffect(imageUrl: string) {
  if (!thumbnailFrameRef.value) return
  if (activeCanvas?.isConnected) activeCanvas.remove()

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  await new Promise<void>((resolve) => {
    const image = new Image()
    image.onload = () => {
      const base = Math.min(window.innerWidth, window.innerHeight)
      const targetWidth = Math.max(120, Math.min(220, Math.floor(base * 0.22)))
      const scale = targetWidth / image.width
      canvas.width = Math.max(1, Math.floor(image.width * scale))
      canvas.height = Math.max(1, Math.floor(image.height * scale))
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve()
    }
    image.onerror = () => resolve()
    image.src = imageUrl
  })

  const flash = document.createElement('div')
  flash.className = 'nuxt-document-scanner-flash'
  document.body.appendChild(flash)
  flash
    .animate([{ opacity: 0 }, { opacity: 0.72 }, { opacity: 0 }], {
      duration: 210,
      easing: 'ease-out',
    })
    .finished.finally(() => flash.remove())
    .catch(() => flash.remove())

  canvas.className = 'nuxt-document-scanner-flyer'
  document.body.appendChild(canvas)
  activeCanvas = canvas

  const destination = thumbnailFrameRef.value.getBoundingClientRect()
  const tx = destination.left + destination.width / 2 - window.innerWidth / 2
  const ty = destination.top + destination.height / 2 - window.innerHeight / 2
  const scale = Math.min(
    destination.width / Math.max(canvas.width, 1),
    destination.height / Math.max(canvas.height, 1),
  )

  await canvas
    .animate(
      [
        {
          transform: 'translate(-50%, -50%) scale(0.72)',
          opacity: 0,
        },
        {
          transform: 'translate(-50%, -50%) scale(1)',
          opacity: 1,
        },
        {
          transform: `translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${scale})`,
          opacity: 0,
        },
      ],
      {
        duration: 620,
        easing: 'cubic-bezier(.2,.8,.2,1)',
      },
    )
    .finished.catch(() => {})

  thumbnailFrameRef.value.classList.add('is-catching')
  setTimeout(() => thumbnailFrameRef.value?.classList.remove('is-catching'), 280)
  canvas.remove()
  if (activeCanvas === canvas) activeCanvas = null
}
</script>

<style scoped>
/* Keep a full camera view while retaining comfortable mobile touch targets. */
.scanner-controls {
  position: relative;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 6px;
  padding: 6px max(16px, env(safe-area-inset-left))
    calc(8px + env(safe-area-inset-bottom))
    max(16px, env(safe-area-inset-right));
  background: #080a0c;
  color: var(--nds-text, #f7f3ea);
  color-scheme: dark;
}

.scanner-controls-top {
  display: flex;
  align-items: center;
  gap: 8px;
  width: min(100%, 420px);
  min-height: 44px;
  margin: 0 auto;
}

.capture-options {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.auto-toggle {
  font-size: 14px;
  font-weight: 600;
}

.icon-button[aria-pressed="true"] {
  color: var(--nds-accent, #77d977);
  border-color: currentColor;
}

.icon-button:focus-visible,
.tool-button:focus-visible,
.thumbnail:focus-visible,
.shutter:focus-visible,
.camera-switcher:focus-within {
  outline: 2px solid var(--nds-accent, #77d977);
  outline-offset: 3px;
}

.camera-switcher {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  height: 44px;
  align-items: center;
  border-radius: 8px;
  background: #1b1e1d;
}

.camera-switcher select {
  appearance: none;
  width: 100%;
  height: 44px;
  box-sizing: border-box;
  min-width: 0;
  padding: 0 28px 0 36px;
  border: 1px solid #454846;
  border-radius: 8px;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 16px;
  text-overflow: ellipsis;
  cursor: pointer;
}

.camera-switcher option {
  background: #1b1e1d;
}

.camera-switcher select:disabled {
  opacity: 0.65;
  cursor: default;
}

.camera-label-icon,
.camera-chevron {
  position: absolute;
  pointer-events: none;
  width: 18px;
  height: 18px;
}

.camera-label-icon {
  left: 10px;
}

.camera-chevron {
  right: 8px;
  width: 14px;
  transform: rotate(90deg);
}

.scanner-controls-row {
  display: grid;
  grid-template-columns: 48px 1fr 48px;
  align-items: center;
  width: min(100%, 420px);
  margin: 0 auto;
}

.icon-button,
.tool-button,
.thumbnail {
  display: grid;
  place-items: center;
  color: inherit;
  cursor: pointer;
}

.icon-button,
.tool-button {
  width: 44px;
  height: 44px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: #1b1e1d;
}

.icon-button:active,
.tool-button:active,
.thumbnail:active {
  transform: translateY(1px);
}

.icon-button:disabled,
.thumbnail:disabled {
  opacity: 0.5;
  cursor: default;
}

.icon-button svg,
.tool-button svg {
  width: 24px;
  height: 24px;
}

.shutter,
.shutter-anchor {
  width: 64px;
  height: 64px;
}

.shutter {
  position: relative;
  display: grid;
  place-items: center;
  padding: 0;
  border: 2px solid #f7f3ea;
  border-radius: 50%;
  background: #f7f3ea;
  cursor: pointer;
  transition: opacity 180ms ease, transform 180ms ease;
}

.shutter-anchor {
  position: relative;
  display: grid;
  place-self: center;
  place-items: center;
}

.shutter.is-stable {
  border-color: var(--nds-accent, #77d977);
}

.shutter.is-disabled {
  cursor: not-allowed;
  opacity: 0.54;
}

.shutter.is-busy .shutter-core {
  background: #f6b942;
  animation: shutter-processing 900ms ease-in-out infinite alternate;
}

.shutter:not(.is-disabled):active {
  transform: scale(0.96);
}

.shutter-ring {
  position: absolute;
  inset: 5px;
  border: 2px solid #111412;
  border-radius: 50%;
}

.shutter-core {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #111412;
  transition: background 180ms ease;
}

.shutter.is-stable .shutter-core {
  background: #287b28;
}

.thumbnail {
  position: relative;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 0;
  background: transparent;
}

.thumbnail-frame {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  overflow: hidden;
  border: 1px solid #454846;
  border-radius: 8px;
  background: #1b1e1d;
}

.thumbnail-frame img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.thumbnail-placeholder {
  width: 24px;
  height: 24px;
  color: #f7f3ea;
}

.page-counter {
  position: absolute;
  top: -4px;
  right: -4px;
  display: grid;
  min-width: 20px;
  height: 20px;
  padding: 0 4px;
  box-sizing: border-box;
  place-items: center;
  border-radius: 10px;
  color: #111412;
  background: #f7f3ea;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.thumbnail-frame.is-catching {
  animation: thumbnail-catch 280ms ease-out both;
}

.countdown {
  position: absolute;
  z-index: 2;
  display: grid;
  width: 78px;
  height: 78px;
  pointer-events: none;
  place-items: center;
}

.countdown :deep(.countdown-ring) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.countdown-value {
  position: absolute;
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 50%;
  color: #f7f3ea;
  background: #111412;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
}

@keyframes thumbnail-catch {
  0% {
    transform: scale(1);
  }
  48% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes shutter-processing {
  to {
    transform: scale(1.55);
  }
}

@media (prefers-reduced-motion: reduce) {
  .shutter,
  .shutter-core,
  .thumbnail-frame.is-catching,
  .countdown {
    animation: none;
    transition: none;
  }
}

:global(.nuxt-document-scanner-flash) {
  position: fixed;
  inset: 0;
  z-index: 2147483638;
  background: #fffef5;
  pointer-events: none;
}

:global(.nuxt-document-scanner-flyer) {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 2147483639;
  pointer-events: none;
  transform: translate(-50%, -50%);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.36);
}
</style>
