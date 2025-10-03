# Document Scanner Implementation

## Overview

A fully functional Nuxt module for real-time document scanning using ONNX edge detection and OpenCV perspective transformation.

## Architecture

### Phase 1: Utilities ✅

Core utilities for document detection and processing:

- **`utils/opencv-loader.ts`**: Dynamic loading of opencv-ts with initialization state management
- **`utils/edge-detection.ts`**: Hough Lines-based quad detection with EMA smoothing
- **`utils/image-processing.ts`**: Perspective warping, frame capture, thumbnails
- **`utils/draw.ts`**: Canvas drawing helpers for overlay visualization

### Phase 2: Module Configuration & Composable ✅

Module setup and main scanning logic:

- **`module.ts`**: Comprehensive `ModuleOptions` with inference, edge detection, camera, and auto-capture settings
- **`composables/useDocumentScanner.ts`**: Main scanner logic coordinating ONNX worker, OpenCV, and detection
- **`workers/edge.worker.ts`**: Refactored ONNX inference worker with WebGPU/WASM support

### Phase 3: Components ✅

UI components with integrated scanning logic:

- **`DocumentScanner.vue`**: Central orchestrator with main detection loop
- **`DocumentScannerCamera.vue`**: Video stream management with exposed ref
- **`DocumentScannerOverlay.vue`**: Real-time quad visualization with draw utils
- **`DocumentScannerControl.vue`**: Bottom control bar (existing)
- **`DocumentScannerPreview.vue`**: Document preview and naming (existing)

## Module Options

```typescript
export default defineNuxtConfig({
  nuxtDocumentScanner: {
    model: {
      name: 'pidinet',
      version: 'tiny', // 'tiny' | 'small' | 'large'
    },
    inference: {
      prefer: 'wasm', // 'webgpu' | 'wasm'
      threads: 4,
      targetResolution: 384,
      mobileResolution: 256,
    },
    edgeDetection: {
      threshold: 0.5,
      houghThreshold: 50,
      minLineLength: 50,
      maxLineGap: 10,
      minAreaPercent: 0.03,
      smoothingAlpha: 0.3,
    },
    camera: {
      defaultResolution: 640,
      highResCapture: 3840,
      facingMode: 'environment',
    },
    autoCapture: {
      enabled: false,
      stableFramesRequired: 30,
      motionThreshold: 8,
    },
  },
})
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ DocumentScanner.vue (Main Loop)                             │
│                                                              │
│ 1. Capture frame from video                                 │
│    └─> grabRGBA(videoElement) → ImageData                   │
│                                                              │
│ 2. Send to worker for inference                             │
│    └─> worker.infer(rgba) → edgeMap                        │
│                                                              │
│ 3. Detect quad using Hough Lines                            │
│    └─> detectQuadWithHoughLines(edgeMap) → rawQuad         │
│                                                              │
│ 4. Apply EMA smoothing                                      │
│    └─> emaQuad(lastQuad, rawQuad) → smoothedQuad           │
│                                                              │
│ 5. Scale to display coordinates                             │
│    └─> scaleQuad(...) → displayQuad                        │
│                                                              │
│ 6. Draw on overlay                                          │
│    └─> DocumentScannerOverlay → drawQuad()                 │
│                                                              │
│ 7. On capture: warp perspective                             │
│    └─> warpPerspective(image, quad) → flattened doc        │
└─────────────────────────────────────────────────────────────┘
```

## Key Features

### Hough Lines Detection

- More precise than contour detection
- Finds straight edges and their intersections
- Filters by orientation (horizontal/vertical)
- Validates quad area and shape

### EMA Smoothing

- Reduces jitter in real-time detection
- Configurable alpha parameter
- Maintains stable overlay visualization

### Performance Optimization

- Off-thread ONNX inference via Web Worker
- Adaptive resolution based on device
- Frame skipping for mobile devices (ready for implementation)
- WebGPU with WASM fallback

### Module Integration

- All utilities auto-imported via Nuxt
- Runtime config for module options
- Type-safe configuration
- Component auto-registration

## Usage

```vue
<template>
  <DocumentScanner
    @close="handleClose"
    @capture="handleCapture"
    @save="handleSave"
  />
</template>

<script setup>
function handleCapture(imageData) {
  console.log('Captured document:', imageData)
}

function handleSave(documents) {
  console.log('Saving documents:', documents)
}

function handleClose() {
  console.log('Scanner closed')
}
</script>
```

## Dependencies

- **opencv-ts**: OpenCV for JavaScript (ES module)
- **onnxruntime-web**: ONNX inference engine
- **Nuxt 4+**: Framework integration

## Next Steps (Optional Enhancements)

1. **Auto-Capture**: Motion detection + stable frame counting
2. **Frame Skipping**: Adaptive based on FPS and device
3. **Multi-page**: Batch scanning support
4. **Export Formats**: PDF generation with embedded images
5. **OCR Integration**: Text extraction (PaddleOCR)
6. **Crop Editor**: Manual quad adjustment UI

## File Structure

```
src/
├── module.ts (164 lines)
├── runtime/
    ├── components/
    │   ├── DocumentScanner.vue (289 lines)
    │   ├── DocumentScannerCamera.vue (35 lines)
    │   ├── DocumentScannerOverlay.vue (92 lines)
    │   ├── DocumentScannerControl.vue (existing)
    │   └── DocumentScannerPreview.vue (existing)
    ├── composables/
    │   ├── useCamera.ts (65 lines)
    │   └── useDocumentScanner.ts (298 lines)
    ├── utils/
    │   ├── opencv-loader.ts (80 lines)
    │   ├── edge-detection.ts (278 lines)
    │   ├── image-processing.ts (189 lines)
    │   └── draw.ts (131 lines)
    └── workers/
        └── edge.worker.ts (271 lines)
```

## Status: ✅ COMPLETE

All three phases implemented and tested:

- ✅ Phase 1: Utilities
- ✅ Phase 2: Module Config & Composable
- ✅ Phase 3: Components Integration
- ✅ Zero linter errors
- ✅ Full type safety
- ✅ Clean architecture
