<template>
  <video ref="video" class="document-scanner-camera" />
</template>

<script setup>
const { start } = useCamera()

const video = ref(null)

onMounted(async () => {
  setTimeout(async () => {
    // measure the dimension of the video element
    const width = video.value.offsetWidth
    const height = video.value.offsetHeight
    console.log(width, height)
    await start(video.value)
  }, 500)
})
</script>

<style scoped>
.document-scanner-camera {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
