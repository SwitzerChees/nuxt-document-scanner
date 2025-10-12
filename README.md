![nuxt-document-scanner](https://raw.githubusercontent.com/SwitzerChees/nuxt-document-scanner/refs/heads/master/playground/assets/header.png)

# Nuxt Document Scanner

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]

**AI-powered mobile document scanning for Nuxt 3/4** with real-time corner detection, automatic capture, and professional image enhancement. Built with ONNX.js, OpenCV.js, and cutting-edge computer vision.

> ⚠️ **DISCLAIMER**: This package is currently under heavy construction and is **NOT STABLE** for production use. The API may change significantly between versions. Contributions, feedback, and help are very welcome! Please open issues for bugs or feature requests.

- [✨ &nbsp;Release Notes](https://github.com/SwitzerChees/nuxt-document-scanner/releases)
- [🏀 &nbsp;Online Demo](https://nuxt-document-scanner.netlify.app)

## Features ✨

### 🤖 **AI-Powered Detection**

- **DocAligner ONNX Model**: State-of-the-art corner detection using deep learning
- **Real-time Processing**: Smooth and accurate document detection with WASM acceleration
- **Smart Stability**: Automatic capture when document is stable and properly positioned

### 📱 **Mobile-First Design**

- **Responsive UI**: Optimized for mobile devices with touch-friendly controls
- **Camera Integration**: Access to device cameras with configurable resolution
- **Auto-capture**: Intelligent timing with countdown and motion detection
- **Preview Mode**: Review and manage captured documents before saving

### Planned Features 🚧

The following features are planned for future releases:

#### 📄 **Document Processing**

- **PDF Support**: Save captured documents as PDF
- **OCR Integration**: Extract text from scanned documents and embed it in the PDF
- **Manual Rotation**: Rotate a document in the preview mode
- **Manual Page Management**: Add and remove pages in the preview mode from a document
- **Manual Edge Correction**: Adjust the edges of a document in the preview mode

#### 🎨 **Advanced Image Enhancement**

- **Auto-rotation**: Intelligent document orientation detection
- **Manual Filter Selection**: Apply postprocessing filters to the captured document by yourself
- **View Transitions**: Smooth view transitions between the camera and the preview mode

#### 🔧 **Developer Experience**

- **i18n Support**: Support for i18n to allow different languages for the UI
- **Theme Customization**: Enhanced UI theming capabilities
- **Performance Metrics**: Built-in performance monitoring and analytics

_Contributions and feature requests are welcome! Please open an issue to discuss new features._

### Known Issues 🐛

- **WebGPU Support**: WebGPU is not supported in all browsers yet. Sadly this is not in my hands to fix.
- **Web Worker Can't be Initialized**: After a refresh in the safari browser especially on iOS, the web worker can't be initialized anymore. Closing the tab or safari and opening it again fixes the issue.

## Setup ⛓️

Run the following command to add the module to your project:

```bash
npx nuxi module add nuxt-document-scanner
```

That's it, you can now use the `<DocumentScanner />` component in your project!

<details>
<summary>Manual Setup</summary>

You can install the module manually with:

```bash
npm i -D nuxt-document-scanner
```

Update your `nuxt.config.ts`

```ts
export default defineNuxtConfig({
  modules: ['nuxt-document-scanner'],
})
```

</details>

## Usage 👌

```vue
<template>
  <div>
    <button @click="showScanner = true">Scan Document</button>
    <DocumentScanner
      :auto-start="true"
      ref="scannerRef"
      v-if="showScanner"
      @close="showScanner = false"
      @save="handleSave"
    />
  </div>
</template>

<script setup>
const showScanner = ref(true)
const scannerRef = ref<InstanceType<typeof DocumentScanner>>()

const handleSave = (document: Document) => {
  console.log('Documents saved:', document)
  scannerRef.value?.stopScanner()
  showScanner.value = false
}
</script>
```

### Nuxt Configuration

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-document-scanner'],

  nuxtDocumentScanner: {
    // Public assets are served from /nuxt-document-scanner/** automatically
    opencvUrl: '/nuxt-document-scanner/opencv/opencv-4.8.0.js',

    videoOptions: {
      facingMode: 'environment', // 'environment' | 'user'
      resolution: 1920, // Camera resolution in pixels
    },

    worker: {
      modelPath:
        '/nuxt-document-scanner/models/lcnet100_h_e_bifpn_256_fp32.onnx',
      onnxPath: '/nuxt-document-scanner/onnx/',
      modelResolution: 256, // Model input resolution
      prefer: 'webgpu', // 'webgpu' | 'wasm'
      threads: 1, // Worker threads (WASM)
      inputName: 'img',
    },

    capture: {
      autoCapture: {
        enabled: true,
        delay: 1000, // ms to wait while stable before capture
        cooldown: 2500, // ms after capture before re-arming
      },
      stableDuration: 1800, // ms the document must stay stable
      stableSignificantMotionThreshold: 0.3,
      stableMotionThreshold: 0.3,
      missedRectanglesDuration: 500,
    },
  },
})
```

## API Reference 📚

### Composables

#### `useDocumentScanner(options)`

Main composable used by the `<DocumentScanner />` component.

```ts
const video = ref<HTMLVideoElement>()
const overlay = ref<HTMLCanvasElement>()

const scanner = useDocumentScanner({
  overlay,
  videoOptions: {
    video,
    resolution: 1920,
    facingMode: 'environment',
  },
  opencvUrl: '/nuxt-document-scanner/opencv/opencv-4.8.0.js',
  worker: {
    modelPath: '/nuxt-document-scanner/models/lcnet100_h_e_bifpn_256_fp32.onnx',
    onnxPath: '/nuxt-document-scanner/onnx/',
    modelResolution: 256,
    prefer: 'webgpu',
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

// Methods
await scanner.startScanner()
scanner.stopScanner()
scanner.createNewDocument()

// Reactive state
scanner.isStarted.value
scanner.isStable.value
scanner.currentDocument.value
scanner.autoCaptureProgress.value
scanner.autoCaptureDelay
```

### Events

```vue
<DocumentScanner
  @close="() => console.log('Scanner closed')"
  @save="(document) => console.log('Document saved:', document)"
/>
```

### Document Object

```ts
type DocumentType = 'image' | 'pdf'
type DocumentFormat = 'jpg' | 'png' | 'pdf'

type DocumentPage = {
  id: string
  original: ImageData
  type: DocumentType
  format: DocumentFormat
  processed: ImageData | undefined
  quad: number[] // [x0,y0,x1,y1,x2,y2,x3,y3]
  timestamp: number
  thumbnail?: string
}

interface Document {
  id: string
  type: DocumentType
  format: DocumentFormat
  pages: DocumentPage[]
}
```

## Customization 🎨

### Custom Model

Use your own ONNX model for specialized document detection:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nuxtDocumentScanner: {
    worker: {
      modelPath: '/models/my-custom-model.onnx',
      onnxPath: '/onnx/',
    },
  },
})
```

### Custom OpenCV

Use a custom OpenCV build:

```ts
export default defineNuxtConfig({
  nuxtDocumentScanner: {
    opencvUrl: '/opencv/custom-opencv.js',
  },
})
```

## Performance Tuning 🚀

### WebGPU vs WASM

```ts
// For modern devices with WebGPU support
worker: {
  prefer: 'webgpu',  // Faster, more efficient
  threads: 1,
}

// For older devices or compatibility
worker: {
  prefer: 'wasm',    // More compatible
  threads: 1         // Lower memory usage
}
```

### Mobile Optimization

```ts
// Optimized for mobile devices
nuxtDocumentScanner: {
  worker: {
    prefer: 'wasm',
    threads: 1,                    // Single thread for mobile
    modelResolution: 256,          // Lower resolution for speed
  },
  videoOptions: {
    resolution: 1280,              // Reasonable camera resolution
  },
  capture: {
    stableDuration: 1500,          // Longer stability check
  }
}
```

### High-Performance Setup

```ts
// For powerful devices
nuxtDocumentScanner: {
  worker: {
    prefer: 'webgpu',
    threads: 4,                    // On WASM this improves throughput
    modelResolution: 256,
  },
  videoOptions: {
    resolution: 3840,              // 4K camera
  }
}
```

## Browser Support 🌐

| Feature        | Chrome | Firefox | Safari       | Edge |
| -------------- | ------ | ------- | ------------ | ---- |
| Basic Scanning | ✅     | ✅      | ✅           | ✅   |
| WASM           | ✅     | ✅      | ✅           | ✅   |
| WebGPU         | ✅     | ❌      | ⚠️ >= iOS 26 | ✅   |
| Camera API     | ✅     | ✅      | ✅           | ✅   |
| Web Workers    | ✅     | ✅      | ✅           | ✅   |

**Note**: WebGPU is fully supported for apple devices from iOS 26 and up. For the preview versions you have the set a feature flag in the safari settings [here](https://webkit.org/blog/14879/webgpu-now-available-for-testing-in-safari-technology-preview/).

## Troubleshooting 🔧

### Common Issues

**Scanner not detecting documents:**

- Ensure good lighting conditions
- Check that the document has clear edges
- Verify camera permissions are granted
- Try adjusting `stableMotionThreshold` in configuration

**Performance issues:**

- Reduce `resolution` for faster processing
- Lower `threads` count for the onnx worker, lower performance but less memory usage

**Camera access denied:**

- Ensure HTTPS is enabled (required for camera access)
- Check browser permissions
- Verify `facingMode` is set correctly

### CORS Configuration

The following CORS headers are required for the module to be able to use more than one thread for the inference:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nitro: {
    routeRules: {
      '/nuxt-document-scanner/onnx/**': {
        headers: {
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Resource-Policy': 'same-origin',
        },
      },
    },
  },
})
```

## Contributing 🤝

I welcome contributions! Please open an issue or a pull request as needed.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/SwitzerChees/nuxt-document-scanner.git
cd nuxt-document-scanner

# Install dependencies
npm install
# or
bun install

# Start development server
npm run dev
# or
bun dev

# Run tests
npm run test
# or
bun test

# Build for production
npm run prepack
# or
bun prepack
```

## License 📄

[MIT License](LICENSE) - feel free to use in your projects!

## Credits 🙏

- **[DocAligner](https://github.com/DocsaidLab/DocAligner)**: AI model for document corner detection
- **[OpenCV.js](https://github.com/TechStark/opencv-js)**: Computer vision library
- **[ONNX Runtime](https://github.com/microsoft/onnxruntime)**: AI inference engine
- **[Nuxt Team](https://nuxt.com)**: Amazing framework and ecosystem

---

**Made with ❤️ for the Nuxt community**

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/nuxt-document-scanner/latest.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-version-href]: https://npmjs.com/package/nuxt-document-scanner
[npm-downloads-src]: https://img.shields.io/npm/dm/nuxt-document-scanner.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-downloads-href]: https://npmjs.com/package/nuxt-document-scanner
[license-src]: https://img.shields.io/github/license/SwitzerChees/nuxt-document-scanner.svg?style=flat&colorA=18181B&colorB=28CF8D
[license-href]: https://github.com/SwitzerChees/nuxt-document-scanner/blob/master/LICENSE
[nuxt-src]: https://img.shields.io/badge/Nuxt-18181B?logo=nuxt.js
