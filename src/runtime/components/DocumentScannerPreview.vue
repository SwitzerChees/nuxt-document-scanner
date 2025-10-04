<template>
  <div class="preview">
    <header class="preview-top">
      <button class="back" aria-label="Back" @click="$emit('back')">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            fill="currentColor"
            d="M15.5 4.5a1 1 0 0 1 0 1.4L10.4 11l5.1 5.1a1 1 0 1 1-1.4 1.4l-5.8-5.8a1.5 1.5 0 0 1 0-2.12l5.8-5.8a1 1 0 0 1 1.4 0Z"
          />
        </svg>
        <span>Back</span>
      </button>

      <div class="title-group">
        <h2>Preview</h2>
        <div class="name-field">
          <label>Document name</label>
          <input :value="defaultName" placeholder="Untitled" readonly />
        </div>
      </div>

      <button class="primary" aria-label="Save">
        <span>Save</span>
      </button>
    </header>

    <main
      class="carousel"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    >
      <div class="track" :style="trackStyle">
        <div v-for="(src, index) in images" :key="index" class="slide">
          <img :src="src" :alt="`Preview ${index + 1}`" />
        </div>
      </div>
      <div v-if="(images?.length || 0) > 1" class="dots">
        <span
          v-for="(_, i) in images"
          :key="i"
          :class="['dot', { active: i === current }]"
        />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{ images?: string[]; defaultName?: string }>()
defineEmits<{ (e: 'back'): void }>()

const current = ref(0)
const startX = ref(0)
const deltaX = ref(0)
const isDragging = ref(false)

const trackStyle = computed(() => {
  const width = 100 * (props.images?.length || 0)
  const translate =
    -(current.value * 100) + (deltaX.value / window.innerWidth) * 100
  return `width:${width}%; transform: translateX(${translate}%);`
})

function onTouchStart(e: TouchEvent) {
  if (!props.images?.length) return
  isDragging.value = true
  startX.value = e.touches[0]?.clientX || 0
  deltaX.value = 0
}

function onTouchMove(e: TouchEvent) {
  if (!isDragging.value) return
  const x = e.touches[0]?.clientX || 0
  deltaX.value = x - startX.value
}

function onTouchEnd() {
  if (!isDragging.value) return
  const threshold = Math.min(80, window.innerWidth * 0.15)
  if (deltaX.value > threshold && current.value > 0) current.value--
  else if (
    deltaX.value < -threshold &&
    current.value < (props.images?.length || 1) - 1
  )
    current.value++
  deltaX.value = 0
  isDragging.value = false
}
</script>

<style scoped>
.preview {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, #0b0f14, #0b0f14 20%, #0e141b 100%);
  color: #e5e7eb;
  display: flex;
  flex-direction: column;
}

.preview-top {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 14px 16px;
  gap: 12px;
  background: rgba(0, 0, 0, 0.45);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(6px);
}

.back {
  justify-self: start;
}
.primary {
  justify-self: end;
}

.title-group {
  text-align: center;
}
.title-group h2 {
  margin: 0;
  font-weight: 600;
  font-size: 16px;
}

.name-field {
  margin-top: 6px;
  display: inline-grid;
  gap: 6px;
}
.name-field label {
  font-size: 11px;
  color: #9ca3af;
}
.name-field input {
  background: rgba(255, 255, 255, 0.06);
  color: #e5e7eb;
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
}

.carousel {
  position: relative;
  flex: 1; /* fill all remaining space under header */
  min-height: 0; /* allow child to size correctly */
  width: 100%;
  overflow: hidden;
}

.track {
  height: 100%;
  display: flex;
  transition: transform 220ms ease;
}

.slide {
  flex: 0 0 100%;
  height: 100%;
  display: grid;
  place-items: center;
  background: #0f172a;
}
.slide img {
  width: 100%;
  height: 100%;
  object-fit: contain; /* always fully visible, never overflow */
}

.dots {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 12px;
  display: flex;
  justify-content: center;
  gap: 8px;
}

.dots .dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.35);
}
.dots .dot.active {
  background: #22c55e;
}

.back,
.primary,
.small,
.ghost {
  appearance: none;
  background: rgba(255, 255, 255, 0.08);
  color: #e5e7eb;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  padding: 8px 10px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: transform 0.12s ease, background 0.2s ease;
}

.primary {
  background: linear-gradient(180deg, #10b981, #059669);
  border-color: transparent;
  color: #04160f;
  font-weight: 600;
}
.ghost {
  background: rgba(255, 255, 255, 0.06);
}
.small {
  padding: 6px 8px;
  border-radius: 8px;
}

.back:hover,
.primary:hover,
.small:hover {
  transform: translateY(-1px);
}
.back:active,
.primary:active,
.small:active {
  transform: translateY(0);
}
</style>
