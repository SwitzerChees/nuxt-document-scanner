<template>
  <div class="document-scanner" :class="{ 'is-preview': showPreview }">
    <div class="scanner-stage">
      <div class="scanner-surface">
        <DocumentScannerCamera v-show="!showPreview" />
        <DocumentScannerPreview
          v-show="showPreview"
          :images="demoImages"
          :default-name="defaultName"
          @back="handleBackFromPreview"
        />
      </div>

      <div class="scanner-top">
        <div class="status-pill" aria-label="Camera active">
          <span class="dot" />
        </div>
        <div class="mode-switch" role="tablist" aria-label="Scan mode">
          <button class="mode is-active" role="tab" aria-selected="true">
            CAMERA
          </button>
          <button class="mode" role="tab" aria-selected="false">EDGES</button>
        </div>
      </div>

      <DocumentScannerControl
        class="scanner-controls"
        :thumbnail="demoThumbnail"
        @close="handleClose"
        @capture="handleCapture"
        @open-preview="handleOpenPreview"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const showPreview = ref(false)

// Prototype-only demo visuals
const demoImages = [
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="%23d1d5db"/><stop offset="1" stop-color="%23f3f4f6"/></linearGradient></defs><rect fill="url(%23g)" width="100%" height="100%"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="40" fill="%239ca3af">Preview Mock</text></svg>',
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect fill="%23e5e7eb" width="100%" height="100%"/><circle cx="400" cy="300" r="140" fill="%23cbd5e1"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="40" fill="%23737486">Page 2</text></svg>',
]
const demoThumbnail = demoImages[0]
const defaultName = 'Scanned document'

function handleOpenPreview() {
  showPreview.value = true
}

function handleBackFromPreview() {
  showPreview.value = false
}

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

.scanner-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding-top: 24px;
  pointer-events: none;
}

.status-pill {
  height: 36px;
  padding: 0 20px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25) inset,
    0 4px 16px rgba(0, 0, 0, 0.25);
}

.status-pill .dot {
  width: 8px;
  height: 8px;
  background: #22c55e;
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.9);
}

.mode-switch {
  display: inline-flex;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  overflow: hidden;
  backdrop-filter: blur(6px);
  pointer-events: auto;
}

.mode {
  appearance: none;
  background: transparent;
  color: #e5e7eb;
  border: 0;
  padding: 8px 14px;
  font-size: 12px;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.mode:hover {
  background: rgba(255, 255, 255, 0.08);
}
.mode.is-active {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.scanner-controls {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
}
</style>
