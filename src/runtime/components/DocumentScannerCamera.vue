<template>
  <video ref="video" class="document-scanner-camera" muted playsinline />
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useCamera } from '../composables/useCamera'

const { start } = useCamera()

const video = ref<HTMLVideoElement>()

onMounted(async () => {
  if (!video.value) return

  const width = video.value.offsetWidth
  const height = video.value.offsetHeight
  const ratio = width / height
  await start(video.value, { clientRatio: ratio })
})

// Expose video ref for parent access
defineExpose({
  video,
})
</script>

<style scoped>
.document-scanner-camera {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #0b0f14;
}
</style>
