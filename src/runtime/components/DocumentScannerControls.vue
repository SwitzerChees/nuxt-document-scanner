<template>
  <div class="camera-controls">
    <!-- Track selector with icons -->
    <div v-if="tracks?.length" class="track-switcher">
      <button
        v-if="tracks?.length > 1"
        class="track-switcher--btn"
        aria-label="Previous camera"
        @click="prevTrack"
      >
        <IconChevronLeft />
      </button>
      <div class="track-switcher--label">
        <IconCamera class="track-switcher--icon" />
        <span>{{ currentTrackLabel }}</span>
      </div>
      <button
        v-if="tracks?.length > 1"
        class="track-switcher--btn"
        aria-label="Next camera"
        @click="nextTrack"
      >
        <IconChevronRight />
      </button>
    </div>

    <!-- Countdown overlay -->
    <div
      v-if="(captureProgress || 0) > 0 && (captureProgress || 0) < 1"
      class="countdown"
    >
      <div class="countdown--backdrop" />
      <div class="countdown--content">
        <IconRing
          :circumference="circumference"
          :capture-progress="captureProgress"
        />
        <div class="countdown--text">
          {{ countdownValue }}
        </div>
      </div>
    </div>

    <!-- Main controls -->
    <div class="camera-controls--row">
      <button class="btn btn--ghost" aria-label="Close" @click="$emit('close')">
        <IconClose />
      </button>

      <button
        class="shutter"
        :class="{ 'is-stable': isStable, 'is-disabled': !canCapture }"
        :disabled="!canCapture"
        aria-label="Capture photo"
        @click="$emit('capture')"
      >
        <span class="shutter--ring" />
        <span class="shutter--dot" :class="{ 'is-stable': isStable }" />
      </button>

      <button
        class="thumbnail"
        aria-label="Open preview"
        @click="$emit('open-preview')"
      >
        <div ref="thumbnailFrameRef" class="thumbnail--frame">
          <img v-if="thumbnail" :src="thumbnail" alt="Last capture" />
          <div v-else class="thumbnail--placeholder"><IconGallery /></div>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import IconClose from './Icon/Close.vue'
import IconGallery from './Icon/Gallery.vue'
import IconRing from './Icon/Ring.vue'
import IconChevronLeft from './Icon/ChevronLeft.vue'
import IconChevronRight from './Icon/ChevronRight.vue'
import IconCamera from './Icon/Camera.vue'

const props = defineProps<{
  canCapture?: boolean
  isStable?: boolean
  captureProgress?: number
  tracks?: MediaStreamTrack[]
  autoCaptureDelay?: number
  thumbnail?: string | null
}>()

const emit = defineEmits<{
  (e: 'close' | 'capture' | 'open-preview'): void
  (e: 'change-track', track: MediaStreamTrack): void
}>()

const circumference = computed(() => 2 * Math.PI * 54)
const activeIndex = ref(0)

// Countdown 3→0 based on capture progress to ensure visibility even for short delays
const countdownValue = computed(() => {
  const p = props.captureProgress || 0
  if (p <= 0 || p >= 1) return 0
  return Math.ceil((1 - p) * 3)
})

const currentTrackLabel = computed(() => {
  const track = props.tracks?.[activeIndex.value]
  return track?.label || `Camera ${activeIndex.value + 1}`
})

const nextTrack = () => {
  if (!props.tracks?.length) return
  activeIndex.value = (activeIndex.value + 1) % props.tracks.length
  const track = props.tracks[activeIndex.value]
  if (!track) return
  emit('change-track', track)
}

const prevTrack = () => {
  if (!props.tracks?.length) return
  activeIndex.value =
    (activeIndex.value - 1 + props.tracks.length) % props.tracks.length
  const track = props.tracks[activeIndex.value]
  if (!track) return
  emit('change-track', track)
}

watch(
  () => props.tracks,
  (val) => {
    if (val?.length && activeIndex.value >= val.length) activeIndex.value = 0
  },
)

// Fancy capture effect: fly newest thumbnail from center to the thumbnail button
const thumbnailFrameRef = ref<HTMLElement>()
let lastThumbnailUrl: string | null = null
let activeCanvas: HTMLCanvasElement | null = null

watch(
  () => props.thumbnail,
  async (val) => {
    if (!val || val === lastThumbnailUrl) return
    lastThumbnailUrl = val
    await nextTick()
    void playCaptureEffect(val).catch(() => {})
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  if (activeCanvas?.isConnected) activeCanvas.remove()
  activeCanvas = null
})

async function playCaptureEffect(imageUrl: string) {
  if (!thumbnailFrameRef.value) return

  // Clean up any previous effect
  if (activeCanvas?.isConnected) activeCanvas.remove()
  activeCanvas = null

  // Prepare canvas
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Draw only the captured image (no frame/border/background)
  await new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const base = Math.min(window.innerWidth, window.innerHeight)
        const targetW = Math.max(180, Math.min(260, Math.floor(base * 0.22)))
        const scale = targetW / img.width
        const drawW = Math.max(1, Math.floor(img.width * scale))
        const drawH = Math.max(1, Math.floor(img.height * scale))
        canvas.width = drawW
        canvas.height = drawH
        ctx.drawImage(img, 0, 0, drawW, drawH)
        resolve()
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = () => resolve() // proceed even if image fails
    img.crossOrigin = 'anonymous'
    img.src = imageUrl
  })

  // Position canvas at viewport center
  canvas.style.position = 'fixed'
  canvas.style.left = '50%'
  canvas.style.top = '50%'
  canvas.style.transform = 'translate(-50%, -50%) scale(0.9)'
  canvas.style.zIndex = '2147483646'
  canvas.style.pointerEvents = 'none'
  canvas.style.willChange = 'transform, opacity, filter'
  document.body.appendChild(canvas)
  activeCanvas = canvas

  // Quick fullscreen flash
  const flash = document.createElement('div')
  flash.style.position = 'fixed'
  flash.style.inset = '0'
  flash.style.background = '#ffffff'
  flash.style.opacity = '0'
  flash.style.pointerEvents = 'none'
  flash.style.zIndex = '2147483645'
  document.body.appendChild(flash)
  flash
    .animate(
      [{ opacity: 0 }, { opacity: 0.85, offset: 0.35 }, { opacity: 0 }],
      { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' },
    )
    .finished.then(() => {
      if (flash.isConnected) flash.remove()
    })
    .catch(() => {
      if (flash.isConnected) flash.remove()
    })

  // Compute destination
  const rect = thumbnailFrameRef.value.getBoundingClientRect()
  const centerX = window.innerWidth / 2
  const centerY = window.innerHeight / 2
  const destX = rect.left + rect.width / 2
  const destY = rect.top + rect.height / 2
  const tx = destX - centerX
  const ty = destY - centerY
  const scaleToThumb =
    Math.min(rect.width / canvas.width, rect.height / canvas.height) * 0.9

  // Stage 1: pop with glow
  await canvas
    .animate(
      [
        {
          transform: 'translate(-50%, -50%) scale(0.6) rotate(-10deg)',
          filter: 'brightness(1) saturate(1)',
          opacity: 0.0,
        },
        {
          transform: 'translate(-50%, -50%) scale(1) rotate(0deg)',
          filter: 'brightness(1.15) saturate(1.2)',
          opacity: 1,
        },
      ],
      { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' },
    )
    .finished.catch(() => {})

  // Stage 2: graceful arc flight
  const rotate = (Math.random() * 14 - 7).toFixed(2)
  const ctrlX = tx * 0.2
  const ctrlY = ty * -0.25 // slight arc upward
  await canvas
    .animate(
      [
        {
          offset: 0,
          transform:
            'translate(-50%, -50%) translate(0px, 0px) scale(1) rotate(0deg)',
        },
        {
          offset: 0.5,
          transform: `translate(-50%, -50%) translate(${ctrlX}px, ${ctrlY}px) scale(${
            (1 + scaleToThumb) / 2
          }) rotate(${rotate}deg)`,
        },
        {
          offset: 1,
          transform: `translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${scaleToThumb}) rotate(${rotate}deg)`,
        },
      ],
      { duration: 620, easing: 'cubic-bezier(.05,.9,.1,1)' },
    )
    .finished.catch(() => {})

  // Destination pulse on the thumbnail
  thumbnailFrameRef.value.classList.add('is-catching')
  setTimeout(() => {
    thumbnailFrameRef.value?.classList.remove('is-catching')
  }, 360)

  // Stage 3: absorb into thumbnail and fade
  await canvas
    .animate(
      [
        {
          transform: `translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${scaleToThumb}) rotate(${rotate}deg)`,
          opacity: 1,
          filter: 'brightness(1.05) saturate(1.1)',
        },
        {
          transform: `translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${Math.max(
            scaleToThumb * 0.2,
            0.05,
          )}) rotate(${rotate}deg)`,
          opacity: 0,
          filter: 'brightness(1) saturate(1)',
        },
      ],
      { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' },
    )
    .finished.catch(() => {})

  // Cleanup
  if (canvas.isConnected) canvas.remove()
  if (activeCanvas === canvas) activeCanvas = null
}
</script>

<style scoped>
.camera-controls {
  position: relative;
  min-height: 180px;
  padding: 16px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent 70%);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 20px;
}

/* Track switcher */
.track-switcher {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #f3f4f6;
  font-size: 14px;
  font-weight: 500;
}

.track-switcher--label {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.08);
  padding: 8px 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(6px);
}

.track-switcher--icon {
  width: 18px;
  height: 18px;
  opacity: 0.8;
}

.track-switcher--btn {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 50%;
  color: #e5e7eb;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(6px);
  cursor: pointer;
  transition: background 0.2s ease, transform 0.1s ease;
}
.track-switcher--btn:hover {
  background: rgba(255, 255, 255, 0.12);
  transform: translateY(-1px);
}

/* Controls row */
.camera-controls--row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 40px;
  width: 100%;
  max-width: 400px;
}

.btn {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  color: #e5e7eb;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(6px);
  cursor: pointer;
  transition: transform 0.1s ease, background 0.2s ease;
}
.btn:hover {
  background: rgba(255, 255, 255, 0.12);
  transform: translateY(-1px);
}
.btn:active {
  transform: translateY(0);
}
.btn--ghost {
  background: rgba(255, 255, 255, 0.04);
}

.shutter {
  position: relative;
  width: 84px;
  height: 84px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  cursor: pointer;
  background: radial-gradient(circle at 50% 40%, #1e293b, #0b0f14);
  border: 2px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  transition: transform 0.1s ease, box-shadow 0.3s ease;
}
.shutter:hover:not(.is-disabled) {
  transform: translateY(-1px);
}
.shutter.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.shutter.is-stable {
  box-shadow: 0 0 24px rgba(34, 197, 94, 0.6);
}

.shutter--ring {
  width: 66px;
  height: 66px;
  border: 3px solid rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  transition: border-color 0.3s ease;
}
.shutter.is-stable .shutter--ring {
  border-color: rgba(34, 197, 94, 0.9);
}

.shutter--dot {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22d3ee;
  box-shadow: 0 0 12px rgba(34, 211, 238, 0.8);
  transition: all 0.3s ease;
}
.shutter--dot.is-stable {
  background: #22c55e;
  box-shadow: 0 0 16px rgba(34, 197, 94, 1);
}

.thumbnail {
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  background: none;
  border: none;
  cursor: pointer;
  overflow: hidden;
  box-sizing: border-box;
}

.thumbnail--frame {
  width: 100%;
  height: 100%;
  border-radius: 10px;
  border: 2px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-sizing: border-box;
}

.thumbnail--frame img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.thumbnail--placeholder {
  display: grid;
  place-items: center;
  color: #9ca3af;
}
.thumbnail:hover .thumbnail--frame {
  filter: brightness(1.1);
}

/* Catch pulse when flyer arrives */
.thumbnail--frame.is-catching {
  animation: captureCatchPulse 360ms ease-out both;
}

@keyframes captureCatchPulse {
  0% {
    transform: scale(1);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35), 0 0 0 0 rgba(255, 255, 255, 0);
    border-color: rgba(255, 255, 255, 0.6);
  }
  40% {
    transform: scale(1.08);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45),
      0 0 0 8px rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.85);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35), 0 0 0 0 rgba(255, 255, 255, 0);
    border-color: rgba(255, 255, 255, 0.6);
  }
}

.countdown {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  z-index: 9999;
  pointer-events: none;
}
.countdown--backdrop {
  position: absolute;
  width: 160px;
  height: 160px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(6px);
}
.countdown--content {
  position: relative;
  display: grid;
  place-items: center;
}
.countdown--text {
  position: absolute;
  font-size: 36px;
  font-weight: 700;
  color: #fff;
}
</style>
