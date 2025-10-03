<template>
  <div class="edges-view">
    <canvas ref="canvasRef" class="edges-canvas" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps<{
  edgeMap?: ImageData
}>()

const canvasRef = ref<HTMLCanvasElement>()

// Resize canvas to match container
function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return

  const parent = canvas.parentElement
  if (!parent) return

  const rect = parent.getBoundingClientRect()
  canvas.width = rect.width
  canvas.height = rect.height
}

// Draw edge map to canvas
function drawEdgeMap() {
  const canvas = canvasRef.value
  if (!canvas || !props.edgeMap) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const { width, height } = canvas
  const edgeMap = props.edgeMap

  // Calculate scaling to fit edge map in canvas while maintaining aspect ratio
  const scaleX = width / edgeMap.width
  const scaleY = height / edgeMap.height
  const scale = Math.max(scaleX, scaleY)

  const scaledWidth = edgeMap.width * scale
  const scaledHeight = edgeMap.height * scale
  const offsetX = (width - scaledWidth) / 2
  const offsetY = (height - scaledHeight) / 2

  // Clear canvas
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  // Create temporary canvas to draw edge map
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = edgeMap.width
  tempCanvas.height = edgeMap.height
  const tempCtx = tempCanvas.getContext('2d')
  if (!tempCtx) return

  tempCtx.putImageData(edgeMap, 0, 0)

  // Draw scaled edge map
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    tempCanvas,
    0,
    0,
    edgeMap.width,
    edgeMap.height,
    offsetX,
    offsetY,
    scaledWidth,
    scaledHeight,
  )
}

// Watch for edge map updates
watch(() => props.edgeMap, drawEdgeMap, { immediate: true })

// Handle resize
let resizeObserver: ResizeObserver | undefined

onMounted(() => {
  resizeCanvas()
  drawEdgeMap()

  if (canvasRef.value?.parentElement) {
    resizeObserver = new ResizeObserver(() => {
      resizeCanvas()
      drawEdgeMap()
    })
    resizeObserver.observe(canvasRef.value.parentElement)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})
</script>

<style scoped>
.edges-view {
  position: absolute;
  inset: 0;
  background: #000;
  overflow: hidden;
}

.edges-canvas {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  image-rendering: crisp-edges;
  image-rendering: -webkit-optimize-contrast;
}
</style>
