<template>
  <video ref="video" class="nuxt-document-scanner-video" muted playsinline />
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useVideo } from '../composables/useVideo'
import { useResizeObserver } from '../composables/useResizeObserver'

const props = withDefaults(
  defineProps<{
    isStreaming: boolean
    resizeDelay?: number
  }>(),
  {
    resizeDelay: 500,
  },
)
const isStreaming = computed(() => props.isStreaming)

const video = ref<HTMLVideoElement>()

const { start, stop } = useVideo()

const startStream = () => {
  if (!video.value) return
  const container = video.value.parentElement
  if (!container) return
  const containerWidth = container.clientWidth
  const containerHeight = container.clientHeight
  start(video.value, {
    width: containerWidth,
    height: containerHeight,
  })
}

watch(isStreaming, (newIsStreaming) => {
  if (newIsStreaming) {
    startStream()
  } else {
    stop()
  }
})

onMounted(() => {
  if (!isStreaming.value) return
  startStream()
})

const { size, isResizing } = useResizeObserver(video, props.resizeDelay)

watch(size, () => {
  if (!isStreaming.value) return
  stop()
  startStream()
})

defineExpose({
  video,
  isResizing,
  size,
})
</script>

<style scoped>
.nuxt-document-scanner-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #0b0f14;
  position: absolute;
  top: 0;
  left: 0;
}
</style>
