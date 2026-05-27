![nuxt-document-scanner](https://raw.githubusercontent.com/SwitzerChees/nuxt-document-scanner/refs/heads/master/playground/assets/header.png)

# Nuxt Document Scanner

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]

Mobile document scanning for Nuxt 4 with camera capture, ONNX Runtime edge detection, OpenCV-based image processing, multi-page preview, and PDF export.

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
- OpenCV.js perspective correction and image post-processing
- Mobile-first scanner UI with camera switching and touch preview
- Automatic capture when the document is stable
- Multi-page document preview with page deletion
- PDF export from scanned pages
- Editable PDF file name before export, with timestamp defaults
- Nuxt module asset serving for ONNX, WASM, OpenCV, and model files
- Vite dev/preview headers for `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`
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

When the user taps **Save PDF**, the scanner opens a file-name dialog. If no `file-name` prop is provided, the default file name is a timestamp like `scan-2026-05-21-12-34-56.pdf`.

```vue
<DocumentScanner
  file-name="invoice-upload.pdf"
  @pdf="handlePdf"
/>
```

## Configuration

These are the current defaults. Most projects can start without custom configuration.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-document-scanner'],

  nuxtDocumentScanner: {
    opencvUrl: '/nuxt-document-scanner/opencv/opencv-4.8.0.js',

    videoOptions: {
      facingMode: 'environment',
      resolution: 1920,
      highResolutionCapture: {
        enabled: false,
        resolution: 1920,
        settleFrames: 3,
        timeout: 1800,
      },
    },

    worker: {
      modelPath:
        '/nuxt-document-scanner/models/lcnet100_h_e_bifpn_256_fp32.onnx',
      onnxPath: '/nuxt-document-scanner/onnx/',
      modelResolution: 256,
      prefer: 'wasm',
      threads: 1,
      inputName: 'img',
      detectionMaxSize: 512,
    },

    capture: {
      autoCapture: {
        enabled: true,
        delay: 1000,
        cooldown: 2500,
      },
      stableDuration: 1800,
      stableSignificantMotionThreshold: 0.3,
      stableMotionThreshold: 0.3,
      missedRectanglesDuration: 500,
    },
  },
})
```

### Worker Runtime

`resolution` controls the preferred camera stream size. iOS uses a capped stream request to avoid the ONNX memory pressure seen on mobile Safari.

`highResolutionCapture` is experimental. When enabled, the scanner keeps the normal live stream for detection and temporarily asks the active camera track for a higher-resolution frame only while saving a page. If the browser cannot switch cleanly or the requested resolution is not actually higher, the scanner falls back to the live frame.

`detectionMaxSize` limits only the live detection frame. The final captured page still uses the full captured frame for image processing and PDF export.

`prefer: 'wasm'` is the recommended ONNX runtime default. With `threads: 1`, the scanner uses the non-threaded SIMD WASM runtime (`ort-wasm-simd.wasm`), which is the safest option for iOS memory behavior. Higher thread counts can use the threaded runtime on browsers that support cross-origin isolation.

`prefer: 'webgpu'` is available for experimentation on browsers with WebGPU support, but browser support is still uneven.

The module serves its runtime files under:

- `/nuxt-document-scanner/models/*`
- `/nuxt-document-scanner/onnx/*`
- `/nuxt-document-scanner/opencv/*`

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
      enabled: false,
      resolution: 1920,
      settleFrames: 3,
      timeout: 1800,
    },
  },
  opencvUrl: '/nuxt-document-scanner/opencv/opencv-4.8.0.js',
  worker: {
    modelPath: '/nuxt-document-scanner/models/lcnet100_h_e_bifpn_256_fp32.onnx',
    onnxPath: '/nuxt-document-scanner/onnx/',
    modelResolution: 256,
    prefer: 'wasm',
    threads: 1,
    inputName: 'img',
  },
  capture: {
    autoCapture: { enabled: true, delay: 1000, cooldown: 2500 },
    stableDuration: 1800,
    stableSignificantMotionThreshold: 0.3,
    stableMotionThreshold: 0.3,
    missedRectanglesDuration: 500,
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
  original: ImageData
  type: DocumentType
  format: DocumentFormat
  processed: ImageData | undefined
  quad: number[]
  timestamp: number
  thumbnail?: string
  width?: number
  height?: number
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

## Deployment

### Secure Context

Browser camera APIs require HTTPS, except on localhost. Deploy your app over HTTPS before testing on a phone.

### Cross-Origin Headers

ONNX Runtime WASM workers need cross-origin isolation for the best browser compatibility. The module configures Vite dev and preview headers automatically. Production hosts should also send:

```txt
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

For Netlify:

```toml
[[headers]]
  for = "/*"
  [headers.values]
    Cross-Origin-Opener-Policy = "same-origin"
    Cross-Origin-Embedder-Policy = "require-corp"
    Cross-Origin-Resource-Policy = "same-origin"
```

The playground in this repository includes a working Netlify configuration.

## Browser Support

| Feature        | Chrome | Firefox | Safari | Edge |
| -------------- | ------ | ------- | ------ | ---- |
| Camera API     | ✅     | ✅      | ✅     | ✅   |
| WASM Runtime   | ✅     | ✅      | ✅     | ✅   |
| Web Workers    | ✅     | ✅      | ✅     | ✅   |
| PDF Export     | ✅     | ✅      | ✅     | ✅   |
| WebGPU Runtime | ✅     | ⚠️      | ⚠️     | ✅   |

## Troubleshooting

### Camera access is blocked

- Use HTTPS or localhost.
- Check browser camera permissions.
- On iOS, close and reopen the tab after changing permissions.
- Make sure no other app is using the camera.

### Worker failed while loading ONNX Runtime

- Ensure the cross-origin headers above are present in production.
- Check that `/nuxt-document-scanner/onnx/ort-wasm-simd.wasm` returns `200`.
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

- Manual corner correction in preview
- Manual rotation
- OCR and searchable PDF output
- i18n support for scanner UI labels
- Theme customization hooks

## Credits

- [DocAligner](https://github.com/DocsaidLab/DocAligner): document corner detection model
- [OpenCV.js](https://github.com/TechStark/opencv-js): computer vision utilities
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
