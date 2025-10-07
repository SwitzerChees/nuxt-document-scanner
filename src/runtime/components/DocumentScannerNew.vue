<template>
  <div class="nuxt-document-scanner">
    <DocumentScannerVideo
      v-show="isCamera"
      ref="videoRef"
      :is-streaming="isCamera || isHeatmaps"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DocumentScannerProps, Document } from '../types'
import type DocumentScannerVideo from './DocumentScannerVideo.vue'

const videoRef = ref<InstanceType<typeof DocumentScannerVideo>>()

// Props
const props = withDefaults(defineProps<DocumentScannerProps>(), {
  mode: 'camera',
  showTopControls: true,
})

// Emits
const emit = defineEmits<{
  close: []
  save: [document: Document[]]
}>()

const isCamera = computed(() => props.mode === 'camera')
const isPreview = computed(() => props.mode === 'preview')
const isHeatmaps = computed(() => props.mode === 'heatmaps')
</script>

<style scoped>
.nuxt-document-scanner {
  width: 100%;
  height: 100%;
  background-color: #943b3b;
}
</style>
