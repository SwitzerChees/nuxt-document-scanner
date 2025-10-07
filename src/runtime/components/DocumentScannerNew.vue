<template>
  <div class="nuxt-document-scanner">
    <h1 class="text-2xl font-bold p-">Document Scanner sa dsdas</h1>
  </div>
</template>

<script setup lang="ts">
import type { DocumentScannerProps, Document } from '../types'

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
