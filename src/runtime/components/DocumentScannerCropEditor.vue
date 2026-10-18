<template>
  <div
    ref="dialogRef"
    class="crop-editor"
    role="dialog"
    aria-modal="true"
    aria-labelledby="crop-editor-title"
    @keydown.stop="trapFocus"
    @keydown.esc="$emit('cancel')"
  >
    <header class="crop-header">
      <button type="button" class="crop-secondary" @click="$emit('cancel')">
        {{ messages.cancel }}
      </button>
      <h2 id="crop-editor-title">{{ messages.adjustCorners }}</h2>
      <button type="button" class="crop-primary" @click="$emit('save', points)">
        {{ messages.apply }}
      </button>
    </header>

    <div ref="stageRef" class="crop-stage">
      <img
        ref="imageRef"
        :src="page.sourceUrl"
        :alt="messages.originalPageAlt"
        @load="measure"
      />
      <div v-if="imageBounds.width" class="crop-overlay" :style="overlayStyle">
        <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          <polygon :points="polygonPoints" />
        </svg>
        <button
          v-for="(point, index) in pointPairs"
          :key="index"
          type="button"
          class="crop-handle"
          :style="handleStyle(point)"
          :aria-label="`${messages.corner} ${index + 1}`"
          @pointerdown="beginDrag(index, $event)"
          @keydown="moveWithKeyboard(index, $event)"
        />
        <div
          v-if="activeIndex !== undefined"
          class="crop-loupe"
          :style="loupeStyle"
          aria-hidden="true"
        />
      </div>
    </div>
    <p class="crop-help">{{ messages.cropHelp }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { DocumentPage, DocumentScannerMessages } from '../types'

const props = defineProps<{ page: DocumentPage; messages: DocumentScannerMessages }>()
defineEmits<{
  cancel: []
  save: [quad: number[]]
}>()

const dialogRef = ref<HTMLElement>()
const stageRef = ref<HTMLElement>()
const imageRef = ref<HTMLImageElement>()
const points = ref(props.page.quad.slice())
const activeIndex = ref<number>()
const imageBounds = reactive({ left: 0, top: 0, width: 0, height: 0 })
let resizeObserver: ResizeObserver | undefined

const pointPairs = computed(() =>
  Array.from({ length: 4 }, (_, index) => ({
    x: points.value[index * 2]!,
    y: points.value[index * 2 + 1]!,
  })),
)
const polygonPoints = computed(() =>
  pointPairs.value.map((point) => `${point.x},${point.y}`).join(' '),
)
const overlayStyle = computed(() => ({
  left: `${imageBounds.left}px`,
  top: `${imageBounds.top}px`,
  width: `${imageBounds.width}px`,
  height: `${imageBounds.height}px`,
}))

const measure = () => {
  const stage = stageRef.value?.getBoundingClientRect()
  const image = imageRef.value?.getBoundingClientRect()
  if (!stage || !image) return
  imageBounds.left = image.left - stage.left
  imageBounds.top = image.top - stage.top
  imageBounds.width = image.width
  imageBounds.height = image.height
}

const handleStyle = (point: { x: number; y: number }) => ({
  left: `${point.x * 100}%`,
  top: `${point.y * 100}%`,
})

const loupeStyle = computed(() => {
  const index = activeIndex.value
  const point = index === undefined ? undefined : pointPairs.value[index]
  if (!point) return {}
  return {
    left: `${point.x * 100}%`,
    top: `${Math.max(0.14, point.y) * 100}%`,
    backgroundImage: `url(${props.page.sourceUrl})`,
    backgroundSize: `${imageBounds.width * 2.5}px ${imageBounds.height * 2.5}px`,
    backgroundPosition: `${point.x * 100}% ${point.y * 100}%`,
  }
})

const updatePointFromEvent = (index: number, event: PointerEvent) => {
  const overlay = stageRef.value?.querySelector('.crop-overlay')?.getBoundingClientRect()
  if (!overlay) return
  points.value[index * 2] = Math.max(0, Math.min(1, (event.clientX - overlay.left) / overlay.width))
  points.value[index * 2 + 1] = Math.max(0, Math.min(1, (event.clientY - overlay.top) / overlay.height))
}

const stopDrag = () => {
  activeIndex.value = undefined
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
}

const onPointerMove = (event: PointerEvent) => {
  if (activeIndex.value === undefined) return
  updatePointFromEvent(activeIndex.value, event)
}

const beginDrag = (index: number, event: PointerEvent) => {
  event.preventDefault()
  activeIndex.value = index
  updatePointFromEvent(index, event)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', stopDrag)
  window.addEventListener('pointercancel', stopDrag)
}

const moveWithKeyboard = (index: number, event: KeyboardEvent) => {
  const directions: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }
  const direction = directions[event.key]
  if (!direction) return
  event.preventDefault()
  const step = event.shiftKey ? 0.025 : 0.005
  points.value[index * 2] = Math.max(0, Math.min(1, points.value[index * 2]! + direction[0] * step))
  points.value[index * 2 + 1] = Math.max(0, Math.min(1, points.value[index * 2 + 1]! + direction[1] * step))
}

const trapFocus = (event: KeyboardEvent) => {
  if (event.key !== 'Tab') return
  const elements = Array.from(
    dialogRef.value?.querySelectorAll<HTMLElement>('button:not([disabled])') || [],
  )
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

onMounted(() => {
  resizeObserver = new ResizeObserver(measure)
  if (stageRef.value) resizeObserver.observe(stageRef.value)
  nextTick(() => {
    measure()
    dialogRef.value?.querySelector<HTMLElement>('button')?.focus()
  })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  stopDrag()
})
</script>

<style scoped>
.crop-editor {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  background: var(--nds-background, #080a0c);
  color: var(--nds-text, #f7f3ea);
}
.crop-header {
  display: grid;
  grid-template-columns: minmax(72px, auto) 1fr minmax(72px, auto);
  align-items: center;
  gap: 10px;
  padding: calc(env(safe-area-inset-top) + 10px) 12px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}
.crop-header h2 {
  margin: 0;
  font-size: 14px;
  text-align: center;
}
.crop-primary,
.crop-secondary {
  min-height: 44px;
  border-radius: 8px;
  font-weight: 800;
  cursor: pointer;
}
.crop-primary {
  border: 1px solid rgba(119, 217, 119, 0.54);
  background: var(--nds-accent, #77d977);
  color: #101410;
}
.crop-secondary {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
}
.crop-stage {
  position: relative;
  display: grid;
  flex: 1;
  min-height: 0;
  place-items: center;
  overflow: hidden;
  background: #111412;
}
.crop-stage > img {
  display: block;
  max-width: calc(100% - 40px);
  max-height: calc(100% - 40px);
  object-fit: contain;
  user-select: none;
}
.crop-overlay {
  position: absolute;
  touch-action: none;
}
.crop-overlay svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.crop-overlay polygon {
  fill: rgba(119, 217, 119, 0.12);
  stroke: var(--nds-accent, #77d977);
  stroke-width: 0.008;
  vector-effect: non-scaling-stroke;
}
.crop-handle {
  position: absolute;
  width: 44px;
  height: 44px;
  transform: translate(-50%, -50%);
  border: 3px solid #101410;
  border-radius: 999px;
  background: var(--nds-accent, #77d977);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.78);
  cursor: grab;
  touch-action: none;
}
.crop-handle:focus-visible {
  outline: 3px solid #f6b942;
  outline-offset: 4px;
}
.crop-loupe {
  position: absolute;
  width: 96px;
  height: 96px;
  transform: translate(-50%, calc(-100% - 28px));
  border: 3px solid #f7f3ea;
  border-radius: 999px;
  background-color: #111412;
  background-repeat: no-repeat;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}
.crop-help {
  margin: 0;
  padding: 12px 18px calc(12px + env(safe-area-inset-bottom));
  color: rgba(247, 243, 234, 0.72);
  font-size: 13px;
  text-align: center;
}
</style>
