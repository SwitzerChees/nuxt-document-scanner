<template>
  <video ref="video" class="document-scanner-camera" muted playsinline />
</template>

<script setup>
const { start } = useCamera()

const video = ref(null)

onMounted(async () => {
  const width = video.value.offsetWidth
  const height = video.value.offsetHeight
  const ratio = width / height
  await start(video.value, { clientRatio: ratio })
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
