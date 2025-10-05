<template>
  <div class="heatmaps-view">
    <canvas ref="heatmapsCanvasRef" class="heatmaps-canvas" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps<{
  heatmaps?: ImageData[]
  videoWidth?: number
  videoHeight?: number
  displayWidth?: number
  displayHeight?: number
  modelInputSize?: number
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

  // Clear canvas
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Get model input size (default to 256 if not provided)
  const modelInputSize = props.modelInputSize || 256

  // If we have video/display dimensions, align with overlay
  if (
    props.videoWidth &&
    props.videoHeight &&
    props.displayWidth &&
    props.displayHeight
  ) {
    // Map heatmaps back to video coordinates, then apply overlay transformation

    // Object-fit: cover scaling (same as overlay)
    const scaleX = props.displayWidth / props.videoWidth
    const scaleY = props.displayHeight / props.videoHeight
    const displayScale = Math.max(scaleX, scaleY)

    // Calculate offsets for centering (same as overlay)
    const scaledVideoWidth = props.videoWidth * displayScale
    const scaledVideoHeight = props.videoHeight * displayScale
    const offsetX = (props.displayWidth - scaledVideoWidth) / 2
    const offsetY = (props.displayHeight - scaledVideoHeight) / 2

    // Color scheme for different corners
    const cornerColors = [
      { r: 255, g: 100, b: 100, label: 'Top-Left' }, // Red
      { r: 100, g: 255, b: 100, label: 'Top-Right' }, // Green
      { r: 100, g: 100, b: 255, label: 'Bottom-Right' }, // Blue
      { r: 255, g: 255, b: 100, label: 'Bottom-Left' }, // Yellow
    ]

    // Find and draw corner points for each heatmap
    for (
      let cornerIdx = 0;
      cornerIdx < Math.min(4, props.heatmaps.length);
      cornerIdx++
    ) {
      const heatmapImageData = props.heatmaps[cornerIdx]!
      const color = cornerColors[cornerIdx]!

      // Find the point with maximum intensity in this heatmap
      const data = heatmapImageData.data
      let maxIntensity = 0
      let maxX = 0
      let maxY = 0

      for (let y = 0; y < heatmapImageData.height; y++) {
        for (let x = 0; x < heatmapImageData.width; x++) {
          const idx = (y * heatmapImageData.width + x) * 4
          const intensity = data[idx]! // Use red channel as intensity

          if (intensity > maxIntensity) {
            maxIntensity = intensity
            maxX = x
            maxY = y
          }
        }
      }

      // The heatmaps are in model input space, we need to convert to video coordinates
      // using the same logic as the worker's postprocessHeatmap function

      // Convert heatmap coordinates to image coordinates (same as worker line 412-416)
      const heatmapToInputScaleX = props.videoWidth / heatmapImageData.width
      const heatmapToInputScaleY = props.videoHeight / heatmapImageData.height

      const videoX = maxX * heatmapToInputScaleX
      const videoY = maxY * heatmapToInputScaleY

      // Apply object-fit: cover transformation (same as overlay)
      const displayX = videoX * displayScale + offsetX
      const displayY = videoY * displayScale + offsetY

      // Draw corner point
      const pointSize = 8

      // Draw point circle
      ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`
      ctx.beginPath()
      ctx.arc(displayX, displayY, pointSize, 0, 2 * Math.PI)
      ctx.fill()

      // Draw point border
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()

      // Draw label
      ctx.font = 'bold 14px system-ui'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#fff'
      ctx.fillText(color.label, displayX, displayY - pointSize - 8)
    }
  } else {
    // Fallback: simple scaling if dimensions not available
    const heatmapSize = modelInputSize
    const scaleX = canvas.width / heatmapSize
    const scaleY = canvas.height / heatmapSize
    const scale = Math.min(scaleX, scaleY)

    const offsetX = (canvas.width - heatmapSize * scale) / 2
    const offsetY = (canvas.height - heatmapSize * scale) / 2

    // Color scheme for different corners
    const cornerColors = [
      { r: 255, g: 100, b: 100, label: 'Top-Left' }, // Red
      { r: 100, g: 255, b: 100, label: 'Top-Right' }, // Green
      { r: 100, g: 100, b: 255, label: 'Bottom-Right' }, // Blue
      { r: 255, g: 255, b: 100, label: 'Bottom-Left' }, // Yellow
    ]

    // Find and draw corner points for each heatmap
    for (
      let cornerIdx = 0;
      cornerIdx < Math.min(4, props.heatmaps.length);
      cornerIdx++
    ) {
      const heatmapImageData = props.heatmaps[cornerIdx]!
      const color = cornerColors[cornerIdx]!

      // Find the point with maximum intensity in this heatmap
      const data = heatmapImageData.data
      let maxIntensity = 0
      let maxX = 0
      let maxY = 0

      for (let y = 0; y < heatmapImageData.height; y++) {
        for (let x = 0; x < heatmapImageData.width; x++) {
          const idx = (y * heatmapImageData.width + x) * 4
          const intensity = data[idx]! // Use red channel as intensity

          if (intensity > maxIntensity) {
            maxIntensity = intensity
            maxX = x
            maxY = y
          }
        }
      }

      // Convert model coordinates to canvas coordinates
      const canvasX = offsetX + maxX * scale
      const canvasY = offsetY + maxY * scale

      // Draw corner point
      const pointSize = 8

      // Draw point circle
      ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`
      ctx.beginPath()
      ctx.arc(canvasX, canvasY, pointSize, 0, 2 * Math.PI)
      ctx.fill()

      // Draw point border
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()

      // Draw label
      ctx.font = 'bold 14px system-ui'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#fff'
      ctx.fillText(color.label, canvasX, canvasY - pointSize - 8)
    }
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
