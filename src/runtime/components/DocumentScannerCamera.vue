<template>
  <video ref="video" class="document-scanner-camera" muted playsinline />
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRuntimeConfig } from '#imports'
import { useCamera } from '../composables/useCamera'

const config = useRuntimeConfig()
const moduleOptions = (config.public.documentScanner || {}) as any

const { start, switchResolution } = useCamera()

const video = ref<HTMLVideoElement>()

onMounted(async () => {
  if (!video.value) return

  // Get actual viewport dimensions for 1:1 mapping
  const container = video.value.parentElement
  if (!container) return

  const displayWidth = container.clientWidth
  const displayHeight = container.clientHeight

  // Camera sensors are typically landscape oriented
  // Request larger dimension as width, smaller as height
  const requestWidth = Math.max(displayWidth, displayHeight)
  const requestHeight = Math.min(displayWidth, displayHeight)

  await start(video.value, {
    width: requestWidth,
    height: requestHeight,
    highResolution: moduleOptions.camera?.highResCapture || 3840,
  })
})

// Expose video ref and methods for parent access
defineExpose({
  video,
  switchResolution,
})
</script>

<style scoped>
.document-scanner-camera {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #0b0f14;
  position: absolute;
  top: 0;
  left: 0;
}
</style>
