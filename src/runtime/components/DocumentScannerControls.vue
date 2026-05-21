<template>
  <div class="scanner-controls">
    <div
      v-if="(captureProgress || 0) > 0 && (captureProgress || 0) < 1"
      class="countdown"
    >
      <div class="countdown-backdrop" />
      <div class="countdown-content">
        <div class="countdown-ring">
          <IconRing
            :circumference="circumference"
            :capture-progress="captureProgress"
          />
        </div>
        <div class="countdown-value">{{ countdownValue }}</div>
      </div>
    </div>

    <div class="scanner-controls-top">
      <div v-if="tracks?.length" class="camera-switcher">
        <button
          v-if="tracks.length > 1"
          class="icon-button"
          type="button"
          aria-label="Previous camera"
          @click="prevTrack"
        >
          <IconChevronLeft />
        </button>
        <div class="camera-label">
          <IconCamera class="camera-label-icon" />
          <span>{{ currentTrackLabel }}</span>
        </div>
        <button
          v-if="tracks.length > 1"
          class="icon-button"
          type="button"
          aria-label="Next camera"
          @click="nextTrack"
        >
          <IconChevronRight />
        </button>
      </div>

      <div class="page-counter" aria-live="polite">
        <span>{{ pageCount }}</span>
      </div>
    </div>

    <div class="scanner-controls-row">
      <button
        class="tool-button"
        type="button"
        aria-label="Close"
        @click="$emit('close')"
      >
        <IconClose />
      </button>

      <button
        class="shutter"
        :class="{ 'is-stable': isStable, 'is-disabled': !isStable }"
        :disabled="!isStable"
        type="button"
        aria-label="Capture page"
        @click="$emit('capture')"
      >
        <span class="shutter-ring" />
        <span class="shutter-core" />
      </button>

      <button
        class="thumbnail"
        type="button"
        aria-label="Open preview"
        @click="$emit('open-preview')"
      >
        <div ref="thumbnailFrameRef" class="thumbnail-frame">
          <img v-if="thumbnail" :src="thumbnail" alt="Last captured page" />
          <IconGallery v-else class="thumbnail-placeholder" />
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { DocumentScannerCamera } from '../types'
import IconClose from './Icon/Close.vue'
import IconGallery from './Icon/Gallery.vue'
import IconRing from './Icon/Ring.vue'
import IconChevronLeft from './Icon/ChevronLeft.vue'
import IconChevronRight from './Icon/ChevronRight.vue'
import IconCamera from './Icon/Camera.vue'

const props = defineProps<{
  isStable?: boolean
  captureProgress?: number
  tracks?: DocumentScannerCamera[]
  autoCaptureDelay?: number
  thumbnail?: string | null
  pageCount?: number
}>()

const emit = defineEmits<{
  (e: 'close' | 'capture' | 'open-preview'): void
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
  return Math.ceil((1 - progress) * 3)
})

const currentTrackLabel = computed(() => {
  const track = props.tracks?.[activeIndex.value]
  return track?.label || `Camera ${activeIndex.value + 1}`
})

const nextTrack = () => {
  if (!props.tracks?.length) return
  activeIndex.value = (activeIndex.value + 1) % props.tracks.length
  const track = props.tracks[activeIndex.value]
  if (track) emit('change-track', track)
}

const prevTrack = () => {
  if (!props.tracks?.length) return
  activeIndex.value =
    (activeIndex.value - 1 + props.tracks.length) % props.tracks.length
  const track = props.tracks[activeIndex.value]
  if (track) emit('change-track', track)
}

watch(
  () => props.tracks,
  (value) => {
    if (value?.length && activeIndex.value >= value.length) activeIndex.value = 0
  },
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
.scanner-controls {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 14px max(16px, env(safe-area-inset-left))
    calc(14px + env(safe-area-inset-bottom))
    max(16px, env(safe-area-inset-right));
  background:
    linear-gradient(to top, rgba(8, 10, 12, 0.95), rgba(8, 10, 12, 0.76)),
    linear-gradient(135deg, rgba(119, 217, 119, 0.12), transparent 45%),
    linear-gradient(225deg, rgba(246, 185, 66, 0.11), transparent 40%);
  color: #f7f3ea;
}

.scanner-controls-top {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 12px;
  min-height: 38px;
}

.camera-switcher {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.camera-label,
.page-counter,
.icon-button,
.tool-button,
.thumbnail-frame {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(16px);
}

.camera-label {
  display: inline-flex;
  min-width: 0;
  max-width: min(62vw, 320px);
  height: 38px;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  padding: 0 11px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.camera-label span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.camera-label-icon {
  width: 18px;
  height: 18px;
  color: #f6b942;
}

.page-counter {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 8px;
  color: #111412;
  background: #f7f3ea;
  font-size: 14px;
  font-weight: 900;
}

.scanner-controls-row {
  display: grid;
  grid-template-columns: 56px minmax(84px, 1fr) 56px;
  align-items: center;
  gap: 22px;
  width: min(100%, 420px);
  margin: 0 auto;
}

.icon-button,
.tool-button,
.thumbnail {
  display: grid;
  place-items: center;
  border: 0;
  color: #f7f3ea;
  cursor: pointer;
}

.icon-button {
  width: 38px;
  height: 38px;
  border-radius: 8px;
}

.tool-button {
  width: 56px;
  height: 56px;
  border-radius: 8px;
}

.icon-button:active,
.tool-button:active,
.thumbnail:active {
  transform: translateY(1px);
}

.shutter {
  position: relative;
  display: grid;
  width: 86px;
  height: 86px;
  place-self: center;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: #f7f3ea;
  box-shadow:
    0 18px 40px rgba(0, 0, 0, 0.42),
    0 0 0 7px rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition:
    box-shadow 180ms ease,
    opacity 180ms ease,
    transform 180ms ease;
}

.shutter.is-stable {
  box-shadow:
    0 18px 40px rgba(0, 0, 0, 0.42),
    0 0 0 7px rgba(119, 217, 119, 0.18),
    0 0 34px rgba(119, 217, 119, 0.45);
}

.shutter.is-disabled {
  cursor: not-allowed;
  opacity: 0.54;
}

.shutter:not(.is-disabled):active {
  transform: scale(0.96);
}

.shutter-ring {
  position: absolute;
  inset: 9px;
  border: 3px solid #111412;
  border-radius: 999px;
}

.shutter-core {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #111412;
  transition:
    background 180ms ease,
    transform 180ms ease;
}

.shutter.is-stable .shutter-core {
  background: #2f8f4e;
  transform: scale(1.2);
}

.thumbnail {
  width: 56px;
  height: 56px;
  padding: 0;
  background: transparent;
}

.thumbnail-frame {
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  overflow: hidden;
  border-radius: 8px;
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
  color: rgba(247, 243, 234, 0.7);
}

.thumbnail-frame.is-catching {
  animation: thumbnail-catch 280ms ease-out both;
}

.countdown {
  position: fixed;
  inset: 0;
  z-index: 2147483640;
  display: grid;
  pointer-events: none;
  place-items: center;
}

.countdown-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.24);
}

.countdown-content {
  position: relative;
  display: grid;
  width: 138px;
  height: 138px;
  place-items: center;
  border-radius: 999px;
  color: #f7f3ea;
}

.countdown-ring {
  position: absolute;
  inset: 0;
}

.countdown-value {
  font-size: 54px;
  font-weight: 900;
  line-height: 1;
  text-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
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
