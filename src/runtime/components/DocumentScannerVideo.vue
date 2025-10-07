<template>
  <video ref="video" class="nuxt-document-scanner-video" muted playsinline />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useVideo } from '../composables/useVideo'
import { useResizeObserver } from '../composables/useResizeObserver'

const props = withDefaults(
  defineProps<{
    streaming: boolean
    resizeDelay?: number
  }>(),
  {
    resizeDelay: 500,
  },
)

const video = ref<HTMLVideoElement>()

const streamSize = ref({ width: 0, height: 0 })

const { start, stop, stream, isStreaming } = useVideo()

const startStream = async () => {
  if (!import.meta.client) return
  if (!video.value) return
  const container = video.value.parentElement
  if (!container) return
  const containerWidth = container.clientWidth
  const containerHeight = container.clientHeight
  const size = await start(video.value, {
    width: containerWidth,
    height: containerHeight,
  })
  if (!size?.width || !size?.height) return
  streamSize.value = size
}

watch(
  () => props.streaming,
  (newStream) => {
    if (newStream) {
      startStream()
    } else {
      stop()
    }
  },
)

const { size: containerSize, isResizing } = useResizeObserver(
  video,
  props.resizeDelay,
)

watch(containerSize, () => {
  if (!props.streaming) return
  stop()
  startStream()
})

defineExpose({
  video,
  stream,
  isResizing,
  isStreaming,
  containerSize,
  streamSize,
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
