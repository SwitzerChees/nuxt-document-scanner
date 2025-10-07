<template>
  <div class="nuxt-document-scanner">
    <DocumentScannerVideo
      ref="videoRef"
      :is-streaming="isCamera || isHeatmaps"
    />
    <DocumentScannerTopControl
      v-show="showTopControls && (isCamera || isHeatmaps)"
      :mode="mode"
      @mode-switch="mode = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  DocumentScannerProps,
  Document,
  DocumentScannerMode,
} from '../types'
import type DocumentScannerVideo from './DocumentScannerVideo.vue'

const videoRef = ref<InstanceType<typeof DocumentScannerVideo>>()

watch(
  () => videoRef.value?.streamSize,
  (streamSize) => {
    console.log('streamSize, ', streamSize)
  },
)
watch(
  () => videoRef.value?.containerSize,
  (containerSize) => {
    console.log('containerSize, ', containerSize)
  },
)

const mode = defineModel<DocumentScannerMode>('mode', {
  default: 'camera',
})

// Props
const props = withDefaults(defineProps<DocumentScannerProps>(), {
  showTopControls: true,
})

// Emits
const emit = defineEmits<{
  close: []
  save: [document: Document[]]
}>()

const isCamera = computed(() => mode.value === 'camera')
const isPreview = computed(() => mode.value === 'preview')
const isHeatmaps = computed(() => mode.value === 'heatmaps')
</script>

<style scoped>
.nuxt-document-scanner {
  width: 100%;
  height: 100%;
  background-color: #943b3b;
}
</style>
