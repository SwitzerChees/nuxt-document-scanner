<template>
  <div class="document-scanner">
    <div class="scanner-stage">
      <div class="scanner-surface">
        <DocumentScannerCamera v-show="isCamera" />
        <DocumentScannerEdges v-show="isEdges" />
        <DocumentScannerPreview
          v-show="isPreview"
          :images="demoImages"
          :default-name="defaultName"
          @back="modeSwitch('camera')"
        />
      </div>

      <DocumentScannerTopControl
        v-show="showTopControls && (isCamera || isEdges)"
        :mode="mode"
        @mode-switch="modeSwitch"
      />

      <DocumentScannerControl
        class="scanner-controls"
        :thumbnail="demoThumbnail"
        @close="handleClose"
        @capture="handleCapture"
        @open-preview="modeSwitch('preview')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  mode?: 'camera' | 'edges' | 'preview'
  showTopControls?: boolean
}>()

const showTopControls = ref(props.showTopControls || true)

const mode = ref(props.mode || 'camera')
const isCamera = computed(() => mode.value === 'camera')
const isEdges = computed(() => mode.value === 'edges')
const isPreview = computed(() => mode.value === 'preview')

function modeSwitch(newMode: 'camera' | 'edges' | 'preview') {
  mode.value = newMode
}

// Prototype-only demo visuals
const demoImages = [
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="%23d1d5db"/><stop offset="1" stop-color="%23f3f4f6"/></linearGradient></defs><rect fill="url(%23g)" width="100%" height="100%"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="40" fill="%239ca3af">Preview Mock</text></svg>',
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect fill="%23e5e7eb" width="100%" height="100%"/><circle cx="400" cy="300" r="140" fill="%23cbd5e1"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="40" fill="%23737486">Page 2</text></svg>',
]
const demoThumbnail = demoImages[0]
const defaultName = 'Scanned document'

function handleClose() {
  // Prototype placeholder for close action
  console.log('Close scanner')
}

function handleCapture() {
  // Prototype placeholder for capture action
  console.log('Capture photo')
}
</script>

<style scoped>
.document-scanner {
  width: 100%;
  height: 100vh;
  background: #000;
  color: #fff;
  position: relative;
  overflow: hidden;
  z-index: 1000;
}

.scanner-stage {
  position: relative;
  width: 100%;
  height: 100%;
}

.scanner-surface {
  position: absolute;
  inset: 0;
  background: #111;
}

.scanner-controls {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
}
</style>
