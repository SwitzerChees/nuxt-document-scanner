<template>
  <div class="preview">
    <header class="preview-top">
      <button class="back" aria-label="Back" @click="$emit('back')">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
        >
          <path
            fill="currentColor"
            d="m10.8 12l3.9 3.9q.275.275.275.7t-.275.7t-.7.275t-.7-.275l-4.6-4.6q-.15-.15-.212-.325T8.425 12t.063-.375t.212-.325l4.6-4.6q.275-.275.7-.275t.7.275t.275.7t-.275.7z"
          />
        </svg>
        <span>Back</span>
      </button>

      <!-- <input
        v-model="documentName"
        name="documentName"
        class="document-name-input"
        placeholder="Document Name"
        readonly
      /> -->
      <div></div>

      <button class="save-button" aria-label="Save" @click="$emit('save')">
        <span>Save</span>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            fill="currentColor"
            d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"
          />
        </svg>
      </button>
    </header>

    <main
      ref="carouselRef"
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
      <button
        v-if="(images?.length || 0) > 1"
        class="nav prev"
        aria-label="Previous"
        @click="prev"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            fill="currentColor"
            d="M15.5 4.5a1 1 0 0 1 0 1.4L10.4 11l5.1 5.1a1 1 0 1 1-1.4 1.4l-5.8-5.8a1.5 1.5 0 0 1 0-2.12l5.8-5.8a1 1 0 0 1 1.4 0Z"
          />
        </svg>
      </button>
      <button
        v-if="(images?.length || 0) > 1"
        class="nav next"
        aria-label="Next"
        @click="next"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            fill="currentColor"
            d="M8.5 19.5a1 1 0 0 1 0-1.4L13.6 13L8.5 7.9a1 1 0 1 1 1.4-1.4l5.8 5.8a1.5 1.5 0 0 1 0 2.12l-5.8 5.8a1 1 0 0 1-1.4 0Z"
          />
        </svg>
      </button>
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
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps<{ images?: string[] }>()
defineEmits<{ (e: 'back' | 'save'): void }>()

// const documentName = defineModel<string>('documentName')

const current = ref(0)
const startX = ref(0)
const deltaX = ref(0)
const isDragging = ref(false)

const carouselRef = ref<HTMLElement>()
const viewportWidth = ref(0)

function measure() {
  viewportWidth.value = carouselRef.value?.clientWidth || window.innerWidth
  // Ensure each slide has exact viewport width to prevent cumulative rounding
  const track = carouselRef.value?.querySelector('.track') as HTMLElement | null
  if (track) {
    const slides = Array.from(track.children) as HTMLElement[]
    slides.forEach((el) => {
      el.style.width = `${viewportWidth.value}px`
      el.style.flex = '0 0 auto'
    })
  }
}

onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
})

const trackStyle = computed(() => {
  const container = Math.max(1, viewportWidth.value)
  const translatePx = -(current.value * container) + deltaX.value
  // Use pixel-based translate so each step equals exactly one viewport width
  return `transform: translate3d(${translatePx}px, 0, 0);`
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
  const threshold = Math.min(80, Math.max(1, viewportWidth.value) * 0.15)
  if (deltaX.value > threshold && current.value > 0) current.value--
  else if (
    deltaX.value < -threshold &&
    current.value < (props.images?.length || 1) - 1
  )
    current.value++
  deltaX.value = 0
  isDragging.value = false
}

function prev() {
  if (current.value > 0) current.value--
}

function next() {
  if (current.value < (props.images?.length || 1) - 1) current.value++
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
  grid-template-columns: minmax(80px, auto) 1fr minmax(80px, auto);
  align-items: center;
  padding: 14px 16px;
  gap: 16px;
  background: rgba(0, 0, 0, 0.45);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(6px);
  min-width: 0; /* Allow shrinking */
}

/* Input styling to match buttons */
.document-name-input {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.08),
    rgba(255, 255, 255, 0.04)
  );
  color: #e5e7eb;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 12px 16px;
  font-size: 16px;
  font-weight: 500;
  text-align: center;
  height: 48px;
  box-sizing: border-box;
  backdrop-filter: blur(8px);
  transition: all 0.2s ease;
  outline: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  min-width: 0; /* Allow shrinking */
  width: 100%; /* Take full available space */
  max-width: none; /* Override any max-width constraints */
}

.document-name-input::placeholder {
  color: rgba(229, 231, 235, 0.5);
}

.document-name-input:focus {
  border-color: rgba(0, 255, 136, 0.4);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2), 0 0 0 3px rgba(0, 255, 136, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
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
  will-change: transform;
}

.slide {
  flex: 0 0 auto; /* fixed pixel width per slide */
  width: 100%; /* fallback, updated via JS sizing */
  height: 100%;
  display: grid;
  place-items: center;
  background: #0f172a;
}
.slide img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain; /* always fully visible, never overflow */
  object-position: center center;
  overflow: hidden;
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

.nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 42px;
  height: 42px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #e5e7eb;
}
.nav.prev {
  left: 10px;
}
.nav.next {
  right: 10px;
}

.back,
.primary {
  appearance: none;
  background: rgba(255, 255, 255, 0.08);
  color: #e5e7eb;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  padding: 8px 10px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: transform 0.12s ease, background 0.2s ease;
  min-width: 0; /* Allow shrinking */
  max-width: 120px; /* Prevent excessive growth */
  white-space: nowrap; /* Prevent text wrapping */
  overflow: hidden;
}

.save-button {
  background: linear-gradient(135deg, #10b981, #059669);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #ffffff;
  font-weight: 600;
  padding: 10px 16px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
  position: relative;
  overflow: hidden;
}

.save-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.2),
    transparent
  );
  transition: left 0.5s ease;
}

.save-button:hover {
  background: linear-gradient(135deg, #059669, #047857);
  border-color: rgba(16, 185, 129, 0.5);
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.3);
}

.save-button:hover::before {
  left: 100%;
}

.save-button:active {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
}

.save-button svg {
  transition: transform 0.2s ease;
}

.save-button:hover svg {
  transform: scale(1.1);
}

.back:active,
.primary:active {
  transform: translateY(0);
}

/* Responsive adjustments for small screens */
@media (max-width: 480px) {
  .preview-top {
    grid-template-columns: minmax(60px, auto) 1fr minmax(60px, auto);
    gap: 12px;
    padding: 12px 14px;
  }

  .back,
  .primary,
  .small,
  .save-button {
    max-width: 100px;
    padding: 6px 8px;
    gap: 6px;
  }

  .document-name-input {
    font-size: 14px;
    padding: 10px 12px;
  }
}

@media (max-width: 360px) {
  .preview-top {
    grid-template-columns: minmax(50px, auto) 1fr minmax(50px, auto);
    gap: 8px;
    padding: 10px 12px;
  }

  .back,
  .primary,
  .save-button {
    max-width: 80px;
    padding: 6px 8px;
    gap: 4px;
  }

  .document-name-input {
    font-size: 13px;
    padding: 8px 10px;
  }
}
</style>
