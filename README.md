![nuxt-document-scanner](https://raw.githubusercontent.com/SwitzerChees/nuxt-document-scanner/refs/heads/master/playground/assets/header.png)

# Nuxt Document Scanner

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]

Mobile document scanning for Nuxt 4 with camera capture, ONNX Runtime edge detection, worker-based perspective correction, corrective multi-page review, and PDF export.

- [Online Demo](https://nuxt-document-scanner.netlify.app)
- [npm package](https://npmjs.com/package/nuxt-document-scanner)
- [Release Notes](https://github.com/SwitzerChees/nuxt-document-scanner/releases)

> This module is actively developed. The scanner and PDF flow are usable, but the API may still change while the module moves toward a stable `1.0`.

## Features

- Real-time document edge detection with the ONNX DocAligner model
- iOS-friendly ONNX WASM setup that avoids the threaded runtime by default
- WASM-first ONNX Runtime setup for broad browser compatibility
- Android-friendly preview geometry so the overlay matches the captured image
- Optional high-resolution capture mode that temporarily raises camera constraints for the saved page
- Worker-based perspective correction and quality profiles without OpenCV
- Mobile-first scanner UI with camera switching and touch preview
- Automatic capture when the document is stable
- Multi-page review with crop correction, rotation, retake, reorder, profiles, and delete undo
- Pinch/wheel zoom, panning, and image import when the camera is unavailable
- Blob-based page storage, real thumbnails, and base64-free PDF export
- Editable PDF file name before export, with timestamp defaults
- Versioned Nuxt asset serving for the ONNX model and only the required WASM files
- Accessible modal focus handling, live status, reduced-motion support, and theme tokens
- Static demo playground ready for Netlify deployment

## Demo

Try the hosted demo here:

[https://nuxt-document-scanner.netlify.app](https://nuxt-document-scanner.netlify.app)

Camera access requires HTTPS or localhost. On iOS, open the demo in Safari or a browser that can request camera permission.

## Setup

Add the module to your Nuxt 4 project:

```bash
npx nuxi module add nuxt-document-scanner
```

Or install it manually:

```bash
npm install nuxt-document-scanner
```

Then register the module:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-document-scanner'],
})
```

## Basic Usage

```vue
<template>
  <button type="button" @click="showScanner = true">
    Scan document
  </button>

  <DocumentScanner
    v-if="showScanner"
    ref="scannerRef"
    @close="showScanner = false"
    @save="handleSave"
    @pdf="handlePdf"
  />

  <a v-if="pdfUrl" :href="pdfUrl" :download="pdfFileName">
    Download PDF
  </a>
</template>

<script setup lang="ts">
import type { Document, DocumentPdfOutput } from 'nuxt-document-scanner'

const showScanner = ref(false)
const scannerRef = ref<InstanceType<typeof DocumentScanner>>()
const pdfUrl = ref('')
const pdfFileName = ref('')

const handleSave = (document: Document) => {
  console.log('Document saved:', document)
  showScanner.value = false
}

const handlePdf = (output: DocumentPdfOutput) => {
  if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value)

  pdfUrl.value = URL.createObjectURL(output.blob)
  pdfFileName.value = output.fileName
}

onBeforeUnmount(() => {
  if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value)
})
</script>
```

**Finish scan** emits the document and closes the scanner. **Create PDF** is a separate, optional export action that leaves the review open. If no `file-name` prop is provided, the default file name is a timestamp like `scan-2026-05-21-12-34-56.pdf`.

```vue
<DocumentScanner
  file-name="invoice-upload.pdf"
  review-after-capture="quality-warning"
  @pdf="handlePdf"
  @complete="handleSave"
/>
```

## Configuration

These are the current defaults. Most projects can start without custom configuration.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-document-scanner'],

  nuxtDocumentScanner: {
    videoOptions: {
      facingMode: 'environment',
      resolution: 1920,
      highResolutionCapture: {
        enabled: true,
        resolution: 1920,
        settleFrames: 3,
        timeout: 1800,
      },
    },

    worker: {
      modelPath:
        '/nuxt-document-scanner/v0.6.0/models/lcnet100_h_e_bifpn_256_fp32.onnx',
      onnxPath: '/nuxt-document-scanner/v0.6.0/onnx/',
      modelResolution: 256,
      prefer: 'wasm',
      inputName: 'img',
      detectionMaxSize: 256,
    },

    capture: {
      autoCapture: {
        enabled: true,
        delay: 1400,
        cooldown: 4500,
      },
      stableDuration: 900,
      stableSignificantMotionThreshold: 0.055,
      stableMotionThreshold: 0.012,
      missedRectanglesDuration: 500,
      minimumDetectionConfidence: 0.45,
      minimumDocumentAreaRatio: 0.02,
      maximumDocumentAspectRatio: 12,
      processingProfile: 'document',
      maxOutputPixels: 8_000_000,
      maxOutputLongEdge: 3200,
      jpegQuality: 0.9,
      thumbnailLongEdge: 360,
    },
  },
})
```

### Worker Runtime

`resolution` controls the preferred camera stream size. iOS uses a capped stream request to avoid the ONNX memory pressure seen on mobile Safari.

`highResolutionCapture` keeps the normal live stream for detection and asks `ImageCapture` or the active camera track for a higher-resolution frame only while saving a page. The operation has a deadline, generation guard, settings verification, and a live-frame fallback.

`detectionMaxSize` limits only the live detection frame. The bundled model has a fixed 256×256 input, so the default avoids an unnecessary larger RGBA transfer. The final captured page still uses the full captured frame for image processing and PDF export.

`prefer: 'wasm'` is the recommended ONNX runtime default. The scanner deliberately uses the single-thread SIMD runtime, so host applications do not need cross-origin isolation headers.

`prefer: 'webgpu'` remains accepted for configuration compatibility, but the bundled worker currently uses its measured WASM entry and logs a fallback warning.

The module serves its runtime files under:

- `/nuxt-document-scanner/v0.6.0/models/*`
- `/nuxt-document-scanner/v0.6.0/onnx/*`

The versioned paths are immutable. `manifest.json` records the SHA-256 of every shipped runtime asset.

## PDF Export

The component emits both the raw scanned document and the generated PDF output:

```vue
<DocumentScanner
  @save="(document) => console.log(document)"
  @pdf="(pdf) => console.log(pdf.fileName, pdf.blob)"
/>
```

```ts
type DocumentPdfOutput = {
  blob: Blob
  bytes: Uint8Array
  file?: File
  fileName: string
}
```

You can also generate a PDF manually:

```ts
const output = await createPdfFromDocument(document, {
  fileName: 'scan.pdf',
  pageSize: 'a4',
})

const file = await createPdfFileFromDocument(document, {
  fileName: 'scan.pdf',
})
```

## API Reference

### `<DocumentScanner />`

Props:

```ts
type DocumentScannerProps = {
  autoStart?: boolean
  fileName?: string
}
```

Events:

```vue
<DocumentScanner
  @close="onClose"
  @save="onDocumentSave"
  @pdf="onPdfCreated"
/>
```

Exposed methods:

```ts
scannerRef.value?.startScanner()
scannerRef.value?.stopScanner()
scannerRef.value?.createNewDocument()
scannerRef.value?.savePdf('custom-name.pdf')
```

### `useDocumentScanner(options)`

Main composable used by the component.

```ts
const video = ref<HTMLVideoElement>()
const overlay = ref<HTMLCanvasElement>()

const scanner = useDocumentScanner({
  overlay,
  videoOptions: {
    video,
    resolution: 1920,
    facingMode: 'environment',
    highResolutionCapture: {
      enabled: true,
      resolution: 1920,
      settleFrames: 3,
      timeout: 1800,
    },
  },
  worker: {
    modelPath: '/nuxt-document-scanner/v0.6.0/models/lcnet100_h_e_bifpn_256_fp32.onnx',
    onnxPath: '/nuxt-document-scanner/v0.6.0/onnx/',
    modelResolution: 256,
    prefer: 'wasm',
    inputName: 'img',
  },
  capture: {
    autoCapture: { enabled: true, delay: 1400, cooldown: 4500 },
    stableDuration: 900,
    stableSignificantMotionThreshold: 0.055,
    stableMotionThreshold: 0.012,
    missedRectanglesDuration: 500,
    minimumDetectionConfidence: 0.45,
    minimumDocumentAreaRatio: 0.02,
    maximumDocumentAspectRatio: 12,
    processingProfile: 'document',
    maxOutputPixels: 8_000_000,
    maxOutputLongEdge: 3200,
    jpegQuality: 0.9,
    thumbnailLongEdge: 360,
  },
})

await scanner.startScanner()
scanner.stopScanner()
scanner.createNewDocument()
```

Reactive state:

```ts
scanner.isStarted.value
scanner.isStable.value
scanner.currentQuality.value
scanner.captureState.value
scanner.currentDocument.value
scanner.autoCaptureProgress.value
scanner.autoCaptureDelay
scanner.error.value
scanner.tracks.value
```

### Document Types

```ts
type DocumentType = 'image' | 'pdf'
type DocumentFormat = 'jpg' | 'png' | 'pdf'

type DocumentPage = {
  id: string
  type: DocumentType
  format: DocumentFormat
  source?: Blob
  processed: Blob
  thumbnail: Blob
  sourceUrl?: string
  previewUrl: string
  thumbnailUrl: string
  sourceWidth: number
  sourceHeight: number
  outputWidth: number
  outputHeight: number
  quad: number[] // normalized source coordinates
  rotation: 0 | 90 | 180 | 270
  profile: 'original' | 'color' | 'document' | 'grayscale' | 'black-and-white'
  processingRecipe: ProcessingRecipe
  quality: QualityAssessment
  needsReview: boolean
  timestamp: number
}

type Document = {
  id: string
  type: DocumentType
  format: DocumentFormat
  createdAt: number
  updatedAt: number
  pages: DocumentPage[]
}
```

## Compatibility

This package is prepared for Nuxt 4. Nuxt 3 may work in some projects, but it is not the advertised compatibility target for the official Nuxt modules listing.

### Labels and theming

All built-in labels can be overridden through the `messages` prop. The scanner also exposes these CSS custom properties on its root: `--nds-background`, `--nds-surface`, `--nds-text`, `--nds-accent`, `--nds-warning`, `--nds-danger`, and `--nds-radius`.

```vue
<DocumentScanner
  :messages="{ capture: 'Seite aufnehmen', close: 'Schliessen' }"
  :theme="{ accent: '#5eead4', background: '#071312' }"
/>
```

`reviewAfterCapture` accepts `never`, `quality-warning` (default), or `always`. `defaultProfile` overrides the configured processing profile for one scanner instance. Set `keepSource` to `false` only when memory is more important than later crop/profile corrections. `exportUi="false"` hides the built-in PDF action.

The `status` and `controls` slots can replace the default camera chrome. Reactive host events are available as `statechange`, `qualitychange`, `pagecaptured`, `pageupdated`, `error`, `pdf`, and `complete`. A constrained host can also call `scanner.importPage(imageFile)` through the exposed component instance.

## Deployment

### Secure Context

Browser camera APIs require HTTPS, except on localhost. Deploy your app over HTTPS before testing on a phone.

The shipped single-thread runtime does not require `SharedArrayBuffer`, COOP, or COEP headers. This avoids changing popup and embedded-resource behavior in host applications.

## Browser Support

| Feature        | Chrome | Firefox | Safari | Edge |
| -------------- | ------ | ------- | ------ | ---- |
| Camera API     | ✅     | ✅      | ✅     | ✅   |
| WASM Runtime   | ✅     | ✅      | ✅     | ✅   |
| Web Workers    | ✅     | ✅      | ✅     | ✅   |
| PDF Export     | ✅     | ✅      | ✅     | ✅   |

## Troubleshooting

### Camera access is blocked

- Use HTTPS or localhost.
- Check browser camera permissions.
- On iOS, close and reopen the tab after changing permissions.
- Make sure no other app is using the camera.

### Worker failed while loading ONNX Runtime

- Check that `/nuxt-document-scanner/v0.6.0/onnx/ort-wasm-simd.wasm` returns `200`.
- Clear the browser cache after upgrading between module versions.

### Scanner does not find the document

- Use a contrasting background.
- Improve lighting and reduce glare.
- Hold the phone steady until the auto-capture ring completes.
- Lower camera resolution on older devices.

### PDF export fails

- Make sure you are using a current version of the module.
- Listen to the `@pdf` event for the generated file/blob.
- In custom flows, call `createPdfFromDocument(document)` only after the document has at least one page.

## Development

```bash
git clone https://github.com/SwitzerChees/nuxt-document-scanner.git
cd nuxt-document-scanner

bun install
cd playground && bun install && cd ..

bun run dev
bun run lint
bun run test
bun run test:types
bun run prepack
```

To test the playground on a phone in your LAN, serve it over HTTPS and bind to `0.0.0.0`.

## Roadmap

- OCR and searchable PDF output
- Host-provided persistence for unfinished scan drafts

## Credits

- [DocAligner](https://github.com/DocsaidLab/DocAligner): document corner detection model
- [ONNX Runtime](https://github.com/microsoft/onnxruntime): browser inference runtime
- [pdf-lib](https://pdf-lib.js.org): PDF generation
- [Nuxt](https://nuxt.com): framework and module ecosystem

## License

[MIT License](LICENSE)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/nuxt-document-scanner/latest.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-version-href]: https://npmjs.com/package/nuxt-document-scanner
[npm-downloads-src]: https://img.shields.io/npm/dm/nuxt-document-scanner.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-downloads-href]: https://npmjs.com/package/nuxt-document-scanner
[license-src]: https://img.shields.io/github/license/SwitzerChees/nuxt-document-scanner.svg?style=flat&colorA=18181B&colorB=28CF8D
[license-href]: https://github.com/SwitzerChees/nuxt-document-scanner/blob/master/LICENSE
