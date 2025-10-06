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
- **Heatmap Visualization**: Debug mode showing AI corner detection confidence

### 📱 **Mobile-First Design**

- **Responsive UI**: Optimized for mobile devices with touch-friendly controls
- **Camera Integration**: Access to device cameras with automatic resolution switching between real-time tracking and high-resolution capture
- **Auto-capture**: Intelligent timing with countdown and motion detection
- **Preview Mode**: Review and manage captured documents before saving

### Planned Features 🚧

The following features are planned for future releases:

#### 📄 **Document Processing**

- **Fully Working webGPU Support**: Use WebGPU for the corner detection inference for much better performance
- **PDF Support**: Save captured documents as PDF
- **OCR Integration**: Extract text from scanned documents and embed it in the PDF
- **Manual Rotation**: Rotate a document in the preview mode
- **Manual Page Management**: Add and remove pages in the preview mode from a document
- **Manual Edge Correction**: Adjust the edges of a document in the preview mode

#### 🎨 **Advanced Image Enhancement**

- **Auto-rotation**: Intelligent document orientation detection
- **Noise Reduction**: Advanced denoising algorithms
- **Color Correction**: Automatic white balance and color adjustment
- **Edge Enhancement**: Sharpen document edges for better readability
- **View Transitions**: Smooth view transitions between the camera and the preview mode

#### 🔧 **Developer Experience**

- **TypeScript Support**: Full type definitions and IntelliSense
- **i18n Support**: Support for i18n to allow different languages for the UI
- **Theme Customization**: Enhanced UI theming capabilities
- **Tailwind CSS Support**: Tailwind CSS support for the UI
- **Performance Metrics**: Built-in performance monitoring and analytics

_Contributions and feature requests are welcome! Please open an issue to discuss new features._

### Known Issues 🐛

- **WebGPU Support**: WebGPU is not supported in all browsers yet.
- **Web Worker Can't be Initialized**: After a refresh in the safari browser, the web worker can't be initialized anymore. Closing the tab or safari and opening it again fixes the issue.

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
      v-if="showScanner"
      @close="showScanner = false"
      @save="handleSave"
    />
  </div>
</template>

<script setup>
const showScanner = ref(false)

const handleSave = (documents) => {
  console.log('Captured documents:', documents)
  // Process your scanned documents
}
</script>
```

### Nuxt Configuration

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-document-scanner'],

  nuxtDocumentScanner: {
    logging: {
      enabled: true, // Enable debug logging
    },
    camera: {
      trackingResolution: 480, // Real-time tracking resolution
      captureResolution: 3840, // High-res capture resolution
    },
    capture: {
      autoCapture: true, // Enable/Disable automatic capture
      stableDuration: 1000, // Stability duration (ms)
      motionThreshold: 20, // Motion sensitivity (pixels)
    },
  },
})
```

## Advanced Configuration ⚙️

### Complete Configuration Options

```ts
export default defineNuxtConfig({
  modules: ['nuxt-document-scanner'],

  nuxtDocumentScanner: {
    // Logging and debugging
    logging: {
      enabled: false, // Set to true for development
    },

    // AI Model configuration
    model: {
      name: 'lcnet100_h_e_bifpn_256_fp32', // Model name
      path: '/custom/models/my-model.onnx', // Custom model path
    },

    // OpenCV configuration
    openCV: {
      url: '/opencv/opencv-4.8.0.js', // OpenCV library URL
    },

    // AI Inference settings
    inference: {
      prefer: 'webgpu', // 'webgpu' | 'wasm'
      threads: 4, // Number of worker threads
      targetResolution: 256, // Model input resolution
    },

    // Camera settings
    camera: {
      trackingResolution: 480, // Real-time tracking resolution
      captureResolution: 3840, // High-res capture resolution
      facingMode: 'environment', // 'environment' | 'user'
    },

    // Capture behavior
    capture: {
      autoCapture: true, // Enable automatic capture
      countdownDuration: 1000, // Countdown timer (ms)
      stableDuration: 1000, // Stability duration (ms)
      motionThreshold: 20, // Motion sensitivity (pixels)
    },
  },
})
```

## API Reference 📚

### Composables

#### `useDocumentScanner(options)`

Main composable for document scanning functionality.

```ts
const scanner = useDocumentScanner({
  modelPath: '/nuxt-document-scanner/models/lcnet100_h_e_bifpn_256_fp32.onnx',
  opencvUrl: '/nuxt-document-scanner/opencv/opencv-4.8.0.js',
  preferExecutionProvider: 'webgpu',
  targetResolution: 256,
  threads: 4,
  stabilityOptions: {
    stableDuration: 1000,
    motionThreshold: 20,
  },
  onReady: () => console.log('Scanner ready'),
  onError: (error) => console.error('Scanner error:', error),
})

// Methods
await scanner.initialize() // Initialize scanner
scanner.start() // Start scanning
scanner.stop() // Stop scanning
await scanner.captureDocument() // Capture current frame
scanner.clearDocuments() // Clear all documents
await scanner.dispose() // Cleanup resources

// Reactive state
scanner.isInitialized.value // Initialization status
scanner.isRunning.value // Scanning status
scanner.isStable.value // Document stability
scanner.documents.value // Captured documents
scanner.detectionStats.value // Detection statistics
scanner.fps.value // Processing FPS
scanner.inferenceTime.value // AI inference time
```

#### `useCamera()`

Camera management composable.

```ts
const camera = useCamera()

// Methods
await camera.start(videoElement, {
  highRes: false,
  width: 1920,
  height: 1080,
  trackingResolution: 480,
  highResolution: 3840,
})

camera.stop()
await camera.switchResolution(videoElement, true, {
  highResolution: 3840,
})

// State
camera.stream.value // MediaStream instance
```

### Events

```vue
<DocumentScanner
  @close="() => console.log('Scanner closed')"
  @capture="(imageData) => console.log('Document captured:', imageData)"
  @save="(documents) => console.log('Documents saved:', documents)"
/>
```

### Document Object

```ts
interface CapturedDocument {
  id: string // Unique document ID
  original: ImageData // Original captured image
  warped: ImageData // Perspective-corrected image
  quad: number[] // Corner coordinates [x0,y0,x1,y1,x2,y2,x3,y3]
  timestamp: number // Capture timestamp
  thumbnail?: string // Base64 thumbnail
}
```

## Customization 🎨

### Custom Styling

The scanner uses CSS custom properties for easy theming:

```css
.document-scanner {
  --scanner-bg: #000;
  --scanner-overlay: rgba(0, 0, 0, 0.8);
  --scanner-accent: #007bff;
  --scanner-success: #28a745;
  --scanner-warning: #ffc107;
  --scanner-error: #dc3545;
}
```

### Custom Model

Use your own ONNX model for specialized document detection:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nuxtDocumentScanner: {
    model: {
      name: 'my-custom-model',
      path: '/models/my-custom-model.onnx',
    },
  },
})
```

### Custom OpenCV

Use a custom OpenCV build:

```ts
export default defineNuxtConfig({
  nuxtDocumentScanner: {
    openCV: {
      url: '/opencv/custom-opencv.js',
    },
  },
})
```

## Performance Tuning 🚀

### WebGPU vs WASM

```ts
// For modern devices with WebGPU support
inference: {
  prefer: 'webgpu',  // Faster, more efficient
  threads: 4
}

// For older devices or compatibility
inference: {
  prefer: 'wasm',    // More compatible
  threads: 1         // Lower memory usage
}
```

### Mobile Optimization

```ts
// Optimized for mobile devices
nuxtDocumentScanner: {
  inference: {
    prefer: 'wasm',
    threads: 1,                    // Single thread for mobile
    targetResolution: 256,         // Lower resolution for speed
  },
  camera: {
    trackingResolution: 480,       // Lower tracking resolution
    captureResolution: 1920,       // Reasonable capture resolution
  },
  capture: {
    stableDuration: 1500,          // Longer stability check
    motionThreshold: 15,           // More sensitive motion detection
  }
}
```

### High-Performance Setup

```ts
// For powerful devices
nuxtDocumentScanner: {
  inference: {
    prefer: 'webgpu',
    threads: 8,                    // Maximum threading
  },
  camera: {
    captureResolution: 4096,       // 4K capture
    trackingResolution: 1080,      // High-res tracking
  }
}
```

## Browser Support 🌐

| Feature        | Chrome | Firefox | Safari | Edge |
| -------------- | ------ | ------- | ------ | ---- |
| Basic Scanning | ✅     | ✅      | ✅     | ✅   |
| WebGPU         | ❌     | ❌      | ❌     | ❌   |
| WASM           | ✅     | ✅      | ✅     | ✅   |
| Camera API     | ✅     | ✅      | ✅     | ✅   |
| Web Workers    | ✅     | ✅      | ✅     | ✅   |

**Note**: WebGPU is not supported yet. Coming soon.

## Troubleshooting 🔧

### Common Issues

**Scanner not detecting documents:**

- Ensure good lighting conditions
- Check that the document has clear edges
- Verify camera permissions are granted
- Try adjusting `motionThreshold` in configuration

**Performance issues:**

- Reduce `targetResolution` for faster processing
- Use `prefer: 'wasm'` for better compatibility
- Lower `threads` count for mobile devices
- Enable `logging` to monitor performance

**Camera access denied:**

- Ensure HTTPS is enabled (required for camera access)
- Check browser permissions
- Verify `facingMode` is set correctly

### Debug Mode

Enable detailed logging to troubleshoot issues:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nuxtDocumentScanner: {
    logging: {
      enabled: true,
    },
  },
})
```

### CORS Configuration

The following CORS headers are required for the module to be able to use more than one thread for the inference:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nitro: {
    routeRules: {
      '/onnx/**': {
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

- **DocAligner**: AI model for document corner detection
- **OpenCV.js**: Computer vision library
- **ONNX Runtime**: AI inference engine
- **Nuxt Team**: Amazing framework and ecosystem

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
