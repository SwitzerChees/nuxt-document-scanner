<template>
  <video ref="video" />
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
