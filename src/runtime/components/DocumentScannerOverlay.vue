<template>
  <canvas ref="canvas" class="document-scanner-overlay" />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { drawQuad, clearCanvas } from '../utils/draw'

// Props
const props = defineProps<{
  quad?: number[]
  detected?: boolean
}>()

// Refs
const canvas = ref<HTMLCanvasElement>()

/**
 * Update canvas size to match container
 */
function updateCanvasSize() {
  if (!canvas.value) return

  const container = canvas.value.parentElement
  if (!container) return

  const width = container.clientWidth
  const height = container.clientHeight

  if (canvas.value.width !== width || canvas.value.height !== height) {
    canvas.value.width = width
    canvas.value.height = height
  }
}

/**
 * Draw the quad on canvas
 */
function draw() {
  if (!canvas.value) return

  const ctx = canvas.value.getContext('2d')
  if (!ctx) return

  // Update canvas size
  updateCanvasSize()

  // Clear canvas
  clearCanvas(canvas.value)

  // Draw quad if available
  if (props.quad && props.quad.length === 8) {
    drawQuad(ctx, props.quad, {
      strokeColor: '#3b82f6', // Professional blue
      strokeWidth: 3,
      fillColor: '#3b82f6',
      cornerRadius: 8,
      shadowBlur: 8,
      shadowColor: 'rgba(0, 0, 0, 0.3)',
    })
  }
}

// Watch for quad changes
watch(() => props.quad, draw, { deep: true })
watch(() => props.detected, draw)

// Handle resize
let resizeObserver: ResizeObserver | undefined

onMounted(() => {
  updateCanvasSize()
  draw()

  // Observe container resize
  if (canvas.value?.parentElement) {
    resizeObserver = new ResizeObserver(() => {
      updateCanvasSize()
      draw()
    })
    resizeObserver.observe(canvas.value.parentElement)
  }
})

// Cleanup
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

// Expose canvas ref for parent access
defineExpose({
  canvas,
})
</script>

<style scoped>
.document-scanner-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  width: 100%;
  height: 100%;
}
</style>
