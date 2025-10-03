<template>
  <video ref="video" class="document-scanner-camera" muted playsinline />
</template>

<script setup>
const { start } = useCamera()

const video = ref(null)

onMounted(async () => {
  await start(video.value)
})
</script>

<style scoped>
.document-scanner-camera {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #0b0f14;
}
</style>
