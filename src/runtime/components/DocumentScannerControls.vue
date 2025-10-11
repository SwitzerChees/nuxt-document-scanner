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
          {{ Math.ceil((1 - (captureProgress || 0)) * 3) }}
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
        <div class="thumbnail--frame">
          <img v-if="thumbnail" :src="thumbnail" alt="Last capture" />
          <div v-else class="thumbnail--placeholder"><IconGallery /></div>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import IconClose from './Icon/Close.vue'
import IconGallery from './Icon/Gallery.vue'
import IconRing from './Icon/Ring.vue'
import IconChevronLeft from './Icon/ChevronLeft.vue'
import IconChevronRight from './Icon/ChevronRight.vue'
import IconCamera from './Icon/Camera.vue'

const props = defineProps<{
  thumbnail?: string | null
  canCapture?: boolean
  isStable?: boolean
  captureProgress?: number
  tracks?: MediaStreamTrack[]
}>()

const emit = defineEmits<{
  (e: 'close' | 'capture' | 'open-preview'): void
  (e: 'change-track', track: MediaStreamTrack): void
}>()

const circumference = computed(() => 2 * Math.PI * 54)
const activeIndex = ref(0)

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
  background: none;
  border: none;
  cursor: pointer;
  display: grid;
  place-items: center;
}
.thumbnail--frame {
  width: 72px;
  height: 72px;
  border-radius: 10px;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.4);
}
.thumbnail--frame img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.thumbnail--placeholder {
  display: grid;
  place-items: center;
  color: #9ca3af;
}
.thumbnail:hover .thumbnail--frame {
  filter: brightness(1.1);
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
