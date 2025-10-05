<template>
  <div class="heatmaps-view">
    <canvas ref="heatmapsCanvasRef" class="heatmaps-canvas" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps<{
  heatmaps?: ImageData[]
}>()

const heatmapsCanvasRef = ref<HTMLCanvasElement>()

// Resize canvas to match container
function resizeCanvas() {
  const canvas = heatmapsCanvasRef.value
  if (!canvas) return

  const parent = canvas.parentElement
  if (!parent) return

  const rect = parent.getBoundingClientRect()
  canvas.width = rect.width
  canvas.height = rect.height
}

// Draw heatmaps to canvas
function drawHeatmaps() {
  const canvas = heatmapsCanvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  if (!props.heatmaps || props.heatmaps.length === 0) {
    // Show message when no heatmaps available (point regression model)
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = '#fff'
    ctx.font = 'bold 24px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('Heatmap Mode', canvas.width / 2, canvas.height / 2 - 30)
    ctx.font = '18px system-ui'
    ctx.fillStyle = '#888'
    ctx.fillText('Point Regression Model', canvas.width / 2, canvas.height / 2)
    ctx.font = '16px system-ui'
    ctx.fillText(
      'No heatmaps available',
      canvas.width / 2,
      canvas.height / 2 + 30,
    )
    return
  }

  // Create 2x2 grid of heatmaps
  const gridCols = 2
  const gridRows = 2
  const cellWidth = canvas.width / gridCols
  const cellHeight = canvas.height / gridRows

  // Clear canvas
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const cornerLabels = ['Top-Left', 'Top-Right', 'Bottom-Right', 'Bottom-Left']

  for (
    let cornerIdx = 0;
    cornerIdx < Math.min(4, props.heatmaps.length);
    cornerIdx++
  ) {
    const heatmapImageData = props.heatmaps[cornerIdx]!

    // Create temporary canvas for this heatmap
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = heatmapImageData.width
    tempCanvas.height = heatmapImageData.height
    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) continue

    tempCtx.putImageData(heatmapImageData, 0, 0)

    // Calculate position in grid
    const col = cornerIdx % gridCols
    const row = Math.floor(cornerIdx / gridCols)

    // Draw heatmap in grid cell (with slight padding)
    const padding = 4
    ctx.drawImage(
      tempCanvas,
      0,
      0,
      heatmapImageData.width,
      heatmapImageData.height,
      col * cellWidth + padding,
      row * cellHeight + padding,
      cellWidth - 2 * padding,
      cellHeight - 2 * padding,
    )

    // Draw corner label with background
    ctx.font = 'bold 16px system-ui'
    ctx.textAlign = 'center'
    const labelText = cornerLabels[cornerIdx]!
    const labelWidth = ctx.measureText(labelText).width
    const labelX = col * cellWidth + cellWidth / 2
    const labelY = row * cellHeight + 24

    // Draw label background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
    ctx.fillRect(labelX - labelWidth / 2 - 8, labelY - 16, labelWidth + 16, 24)

    // Draw label text
    ctx.fillStyle = '#fff'
    ctx.fillText(labelText, labelX, labelY)

    // Draw grid borders
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 2
    ctx.strokeRect(col * cellWidth, row * cellHeight, cellWidth, cellHeight)
  }
}

// Watch for heatmap updates
watch(() => props.heatmaps, drawHeatmaps, { immediate: true, deep: true })

// Handle resize
let resizeObserver: ResizeObserver | undefined

onMounted(() => {
  resizeCanvas()

  if (heatmapsCanvasRef.value?.parentElement) {
    resizeObserver = new ResizeObserver(() => {
      resizeCanvas()
      // drawHeatmaps will be called by the watcher when heatmaps are available
    })
    resizeObserver.observe(heatmapsCanvasRef.value.parentElement)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})
</script>

<style scoped>
.heatmaps-view {
  position: absolute;
  inset: 0;
  background: #000;
  overflow: hidden;
}

.heatmaps-canvas {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  image-rendering: crisp-edges;
}
</style>
