<template>
  <div class="demo-shell">
    <header class="demo-header">
      <div class="brand-lockup">
        <div class="brand-mark">DS</div>
        <div>
          <p class="eyebrow">Nuxt module</p>
          <h1>Document Scanner</h1>
        </div>
      </div>
      <div class="header-actions">
        <a class="text-link" href="https://github.com/SwitzerChees/nuxt-document-scanner" target="_blank" rel="noreferrer">
          GitHub
        </a>
        <button class="primary-action" type="button" @click="openScanner">
          Start scan
        </button>
      </div>
    </header>

    <main class="workbench">
      <section class="scan-stage">
        <div class="stage-media">
          <img :src="headerImage" alt="Nuxt Document Scanner preview" />
        </div>
        <div class="stage-controls">
          <div>
            <p class="eyebrow">Live capture</p>
            <h2>{{ scanTitle }}</h2>
          </div>
          <div class="status-grid">
            <div class="status-tile">
              <span>{{ scannedPageCount }}</span>
              <small>Pages</small>
            </div>
            <div class="status-tile">
              <span>{{ pdfSize }}</span>
              <small>PDF</small>
            </div>
          </div>
          <p v-if="!isSecureContext" class="secure-warning">
            Camera access needs HTTPS or localhost.
          </p>
          <button class="start-button" type="button" @click="openScanner">
            <span>Open scanner</span>
            <span class="start-button-arrow">-></span>
          </button>
        </div>
      </section>

      <section class="output-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Output</p>
            <h2>{{ outputTitle }}</h2>
          </div>
          <button
            class="secondary-action"
            type="button"
            :disabled="!pdfUrl"
            @click="downloadPdf"
          >
            Download
          </button>
        </div>

        <div class="pdf-preview">
          <iframe v-if="pdfUrl" :src="pdfUrl" title="Generated PDF preview" />
          <div v-else class="empty-output">
            <div class="document-silhouette">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </section>
    </main>

    <DocumentScanner
      v-if="showScanner"
      ref="scannerRef"
      @close="showScanner = false"
      @pdf="handlePdf"
      @save="handleSave"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Document, DocumentPdfOutput } from '../../src/runtime/types'
import type DocumentScanner from '../../src/runtime/components/DocumentScanner.vue'
import headerImage from '../assets/header.png'

useHead({
  title: 'Nuxt Document Scanner Demo',
  meta: [
    {
      name: 'viewport',
      content:
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover',
    },
    {
      name: 'theme-color',
      content: '#0b0d0f',
    },
  ],
})

const showScanner = ref(false)
const scannerRef = ref<InstanceType<typeof DocumentScanner>>()
const scannedDocument = ref<Document>()
const pdf = ref<DocumentPdfOutput>()
const pdfUrl = ref('')
const isSecureContext = ref(true)

const scannedPageCount = computed(() => scannedDocument.value?.pages.length || 0)
const scanTitle = computed(() =>
  scannedPageCount.value ? 'Scan complete' : 'Ready to scan',
)
const outputTitle = computed(() => (pdf.value ? pdf.value.fileName : 'No PDF yet'))
const pdfSize = computed(() => {
  if (!pdf.value?.blob.size) return '-'
  const size = pdf.value.blob.size
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
})

const openScanner = () => {
  showScanner.value = true
}

const handleSave = (savedDocument: Document) => {
  scannedDocument.value = savedDocument
  scannerRef.value?.stopScanner()
  showScanner.value = false
}

const handlePdf = (output: DocumentPdfOutput) => {
  if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value)
  pdf.value = output
  pdfUrl.value = URL.createObjectURL(output.blob)
}

const downloadPdf = () => {
  if (!pdfUrl.value || !pdf.value) return
  const anchor = window.document.createElement('a')
  anchor.href = pdfUrl.value
  anchor.download = pdf.value.fileName
  anchor.click()
}

onMounted(() => {
  isSecureContext.value = window.isSecureContext
})

onBeforeUnmount(() => {
  if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value)
})
</script>

<style>
:root {
  color-scheme: dark;
  font-family:
    Manrope,
    Avenir Next,
    ui-sans-serif,
    system-ui,
    sans-serif;
  background: #0b0d0f;
}

* {
  box-sizing: border-box;
}

html,
body,
#__nuxt {
  min-height: 100%;
  margin: 0;
}

button,
a {
  font: inherit;
}

.demo-shell {
  min-height: 100vh;
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(180deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(135deg, rgba(119, 217, 119, 0.12), transparent 34rem),
    linear-gradient(225deg, rgba(246, 185, 66, 0.12), transparent 30rem),
    #0b0d0f;
  background-size: 36px 36px, 36px 36px, auto, auto, auto;
  color: #f6f1e8;
}

.demo-header {
  display: flex;
  min-height: 76px;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px clamp(18px, 4vw, 44px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(11, 13, 15, 0.82);
  backdrop-filter: blur(18px);
}

.brand-lockup,
.header-actions,
.stage-controls,
.panel-header,
.status-grid {
  display: flex;
  align-items: center;
}

.brand-lockup {
  gap: 14px;
}

.brand-mark {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 1px solid rgba(119, 217, 119, 0.42);
  border-radius: 8px;
  background: #77d977;
  color: #101410;
  font-weight: 950;
  letter-spacing: -0.05em;
}

.eyebrow {
  margin: 0 0 4px;
  color: #f6b942;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

h1,
h2 {
  margin: 0;
  letter-spacing: 0;
}

h1 {
  font-size: clamp(22px, 3vw, 34px);
  line-height: 1;
}

h2 {
  font-size: clamp(24px, 4vw, 46px);
  line-height: 1.02;
}

.header-actions {
  gap: 10px;
}

.text-link,
.primary-action,
.secondary-action,
.start-button {
  border-radius: 8px;
  text-decoration: none;
}

.text-link {
  color: #f6f1e8;
  font-size: 14px;
  font-weight: 800;
  opacity: 0.78;
}

.primary-action,
.secondary-action,
.start-button {
  min-height: 42px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  cursor: pointer;
  font-weight: 900;
}

.primary-action,
.start-button {
  background: #77d977;
  color: #101410;
}

.primary-action {
  padding: 0 16px;
}

.secondary-action {
  background: rgba(255, 255, 255, 0.08);
  color: #f6f1e8;
  padding: 0 14px;
}

.secondary-action:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.workbench {
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(340px, 0.88fr);
  gap: 18px;
  min-height: calc(100vh - 76px);
  padding: 18px clamp(18px, 4vw, 44px) 26px;
}

.scan-stage,
.output-panel {
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.055);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
}

.scan-stage {
  display: grid;
  grid-template-rows: minmax(260px, 1fr) auto;
}

.stage-media {
  position: relative;
  display: grid;
  min-height: 0;
  overflow: hidden;
  place-items: center;
  background: #05070a;
}

.stage-media img {
  width: 100%;
  height: 100%;
  min-height: 300px;
  display: block;
  object-fit: contain;
}

.stage-controls {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto minmax(172px, 210px);
  align-items: center;
  gap: 18px;
  padding: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(11, 13, 15, 0.86);
}

.status-grid {
  gap: 10px;
}

.status-tile {
  display: grid;
  width: 94px;
  min-height: 64px;
  align-content: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.07);
}

.status-tile span {
  color: #f6f1e8;
  font-size: 22px;
  font-weight: 950;
}

.status-tile small {
  color: rgba(246, 241, 232, 0.62);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.secure-warning {
  max-width: 220px;
  margin: 0;
  align-self: center;
  color: #ffd09a;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.35;
}

.start-button {
  display: inline-flex;
  width: 100%;
  min-width: 172px;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 0 16px;
}

.start-button-arrow {
  font-weight: 950;
}

.output-panel {
  display: grid;
  grid-template-rows: auto 1fr;
}

.panel-header {
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.pdf-preview {
  min-height: 0;
  background: #141715;
}

.pdf-preview iframe {
  width: 100%;
  height: 100%;
  min-height: 520px;
  border: 0;
  background: #f6f1e8;
}

.empty-output {
  display: grid;
  min-height: 520px;
  place-items: center;
}

.document-silhouette {
  display: grid;
  width: min(56%, 220px);
  aspect-ratio: 0.72;
  align-content: start;
  gap: 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: #f6f1e8;
  padding: 28px;
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.34);
}

.document-silhouette span {
  height: 10px;
  border-radius: 999px;
  background: #181b19;
  opacity: 0.16;
}

.document-silhouette span:nth-child(2) {
  width: 76%;
}

.document-silhouette span:nth-child(3) {
  width: 48%;
  background: #77d977;
  opacity: 0.72;
}

@media (max-width: 920px) {
  .demo-header {
    align-items: flex-start;
  }

  .header-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .workbench {
    grid-template-columns: 1fr;
  }

  .stage-controls {
    display: grid;
    grid-template-columns: 1fr;
  }

  .status-grid {
    flex-wrap: wrap;
  }
}

@media (max-width: 560px) {
  .demo-header {
    display: grid;
    grid-template-columns: 1fr;
  }

  .header-actions {
    justify-content: space-between;
  }

  .primary-action {
    flex: 1;
  }

  .workbench {
    min-height: auto;
    padding: 12px;
  }

  .stage-media img,
  .pdf-preview iframe,
  .empty-output {
    min-height: 360px;
  }
}
</style>
