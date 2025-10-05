![nuxt-document-scanner](https://raw.githubusercontent.com/SwitzerChees/nuxt-document-scanner/refs/heads/master/playground/assets/header.png)

# Nuxt Document Scanner

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]

**AI-powered mobile document scanning for Nuxt 4** with real-time corner detection, automatic capture, and professional image enhancement. Built with ONNX.js, OpenCV.js, and cutting-edge computer vision.

- [✨ &nbsp;Release Notes](https://github.com/SwitzerChees/nuxt-document-scanner/releases)
- [🏀 &nbsp;Online Demo](https://nuxt-document-scanner.netlify.app)

## Features ✨

### 🤖 **AI-Powered Detection**

- **DocAligner ONNX Model**: State-of-the-art corner detection using deep learning
- **Real-time Processing**: 60fps document detection with WebGPU/WASM acceleration
- **Smart Stability**: Automatic capture when document is stable and properly positioned
- **Heatmap Visualization**: Debug mode showing AI detection confidence

### 📱 **Mobile-First Design**

- **Responsive UI**: Optimized for mobile devices with touch-friendly controls
- **Camera Integration**: Seamless access to device cameras with resolution switching
- **Auto-capture**: Intelligent timing with countdown and motion detection
- **Preview Mode**: Review and manage captured documents before saving

### 🎨 **Professional Image Processing**

- **Perspective Correction**: Automatic document flattening and straightening
- **Image Enhancement**: CLAHE, unsharp masking, and color space optimization
- **High-Resolution Capture**: Up to 4K capture with real-time preview
- **Multiple Formats**: Support for PNG, JPEG with configurable quality

### ⚡ **Performance Optimized**

- **Web Workers**: Non-blocking AI inference on separate threads
- **Memory Efficient**: Optimized for mobile devices with configurable threading
- **Caching**: Intelligent model and asset caching with long-term storage
- **Fallback Support**: Graceful degradation from WebGPU to WASM

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
  modelPath: '/models/lcnet100_h_e_bifpn_256_fp32.onnx',
  opencvUrl: '/opencv/opencv-4.8.0.js',
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
| WebGPU         | ✅     | ✅      | ❌     | ✅   |
| WASM           | ✅     | ✅      | ✅     | ✅   |
| Camera API     | ✅     | ✅      | ✅     | ✅   |
| Web Workers    | ✅     | ✅      | ✅     | ✅   |

**Note**: WebGPU provides the best performance but requires HTTPS and modern browser support. The module automatically falls back to WASM when WebGPU is unavailable.

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

For development, configure CORS headers:

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
