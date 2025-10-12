<template>
  <div class="preview">
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
        <IconChevronLeft />
      </button>
      <button
        v-if="(images?.length || 0) > 1"
        class="nav next"
        aria-label="Next"
        @click="next"
      >
        <IconChevronRight />
      </button>
    </main>

    <div v-if="(images?.length || 0) > 1" class="dots" ref="dotsRef">
      <span
        v-for="(_, i) in images"
        :key="i"
        :class="['dot', { active: i === current }]"
      />
    </div>

    <footer class="actions">
      <button class="btn back" aria-label="Back" @click="$emit('back')">
        <IconBack />
        <span>Back</span>
      </button>
      <button class="btn save" aria-label="Save" @click="$emit('save')">
        <span>Save</span>
        <IconSave />
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import IconSave from './Icon/Save.vue'
import IconBack from './Icon/Back.vue'
import IconChevronLeft from './Icon/ChevronLeft.vue'
import IconChevronRight from './Icon/ChevronRight.vue'

const props = defineProps<{ images?: string[] }>()
defineEmits<{ (e: 'back' | 'save'): void }>()

const current = ref(0)
const startX = ref(0)
const deltaX = ref(0)
const isDragging = ref(false)
const carouselRef = ref<HTMLElement>()
const viewportWidth = ref(0)
let restoreBodyOverflow: string | null = null
let restoreBodyTouchAction: string | null = null
const dotsRef = ref<HTMLElement>()

const measure = () => {
  viewportWidth.value = carouselRef.value?.clientWidth || window.innerWidth
  const track = carouselRef.value?.querySelector('.track') as HTMLElement | null
  if (!track) return
  Array.from(track.children).forEach((el) => {
    const slide = el as HTMLElement
    slide.style.width = `${viewportWidth.value}px`
    slide.style.flex = '0 0 auto'
  })
}

onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
  // lock body scroll while preview is active
  restoreBodyOverflow = document.body.style.overflow
  restoreBodyTouchAction = document.body.style.touchAction as string
  document.body.style.overflow = 'hidden'
  document.body.style.touchAction = 'none'
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
  if (restoreBodyOverflow !== null)
    document.body.style.overflow = restoreBodyOverflow
  if (restoreBodyTouchAction !== null)
    document.body.style.touchAction = restoreBodyTouchAction
})

const trackStyle = computed(() => {
  const width = Math.max(1, viewportWidth.value)
  const translate = -(current.value * width) + deltaX.value
  const total = (props.images?.length || 1) * width
  return `width:${total}px;transform:translate3d(${translate}px,0,0);${
    isDragging.value ? 'transition:none;' : ''
  }`
})

const onTouchStart = (e: TouchEvent) => {
  e.preventDefault()
  if (!props.images?.length) return
  isDragging.value = true
  startX.value = e.touches[0]?.clientX || 0
  deltaX.value = 0
}

const onTouchMove = (e: TouchEvent) => {
  e.preventDefault()
  if (!isDragging.value) return
  deltaX.value = (e.touches[0]?.clientX || 0) - startX.value
}

const onTouchEnd = () => {
  if (!isDragging.value) return
  const threshold = Math.min(80, viewportWidth.value * 0.15)
  if (deltaX.value > threshold && current.value > 0) current.value--
  else if (
    deltaX.value < -threshold &&
    current.value < (props.images?.length || 1) - 1
  )
    current.value++
  deltaX.value = 0
  isDragging.value = false
}

const prev = () => current.value > 0 && current.value--
const next = () =>
  current.value < (props.images?.length || 1) - 1 && current.value++

const clampCurrentToBounds = () => {
  const maxIndex = Math.max(0, (props.images?.length || 1) - 1)
  if (current.value > maxIndex) current.value = maxIndex
  if (current.value < 0) current.value = 0
}

watch(
  () => props.images?.length,
  () => {
    clampCurrentToBounds()
    nextTick(() => measure())
  },
)

watch(
  () => props.images,
  () => {
    clampCurrentToBounds()
    nextTick(() => measure())
  },
)

const scrollActiveDotIntoView = () => {
  const container = dotsRef.value
  if (!container) return
  const active = container.querySelector('.dot.active') as HTMLElement | null
  if (!active) return
  active.scrollIntoView({
    behavior: 'smooth',
    inline: 'center',
    block: 'nearest',
  })
}

watch(current, () => {
  nextTick(() => scrollActiveDotIntoView())
})
</script>

<style scoped>
.preview {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #0b0f14;
  color: #e5e7eb;
  overflow: hidden;
  overscroll-behavior: none;
}

.carousel {
  position: relative;
  flex: 1;
  overflow: hidden;
  display: flex;
  align-items: stretch; /* ensure track uses full height */
  justify-content: flex-start; /* prevent centering offset */
  background: #0e141b;
  touch-action: none; /* prevent native scrolling in the carousel area */
}

.track {
  display: flex;
  height: 100%;
  transition: transform 250ms ease;
  will-change: transform;
  /* fix: make the track as wide as total slides */
  width: 100%;
}
.slide {
  flex: 0 0 auto; /* width is explicitly set via JS measurement */
  height: 100%;
  display: grid;
  place-items: center;
  background: #0f172a;
}

.slide img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  display: block;
  object-fit: contain; /* keep aspect ratio and use max space */
  object-position: center;
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
  cursor: pointer;
  transition: background 0.2s;
}
.nav:hover {
  background: rgba(255, 255, 255, 0.15);
}
.nav.prev {
  left: 12px;
}
.nav.next {
  right: 12px;
}

.dots {
  display: flex;
  justify-content: flex-start; /* left align for horizontal scrolling */
  gap: 8px;
  padding: 12px 12px; /* side padding to avoid edge clipping while scrolling */
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.3);
  transition: background 0.2s;
}
.dot.active {
  background: #22c55e;
}

.actions {
  display: flex;
  justify-content: space-between;
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(8px);
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 10px;
  padding: 10px 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn.back {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #e5e7eb;
}
.btn.back:hover {
  background: rgba(255, 255, 255, 0.12);
}

.btn.save {
  background: linear-gradient(135deg, #10b981, #059669);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: white;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
}
.btn.save:hover {
  background: linear-gradient(135deg, #34d399, #10b981);
  box-shadow: 0 3px 10px rgba(16, 185, 129, 0.25);
}

@media (max-width: 480px) {
  .btn {
    padding: 8px 12px;
    font-size: 14px;
  }
  .nav {
    width: 36px;
    height: 36px;
  }
}
</style>
