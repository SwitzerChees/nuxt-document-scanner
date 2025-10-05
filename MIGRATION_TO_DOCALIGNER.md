# Migration to DocAligner

This document describes the migration from PiDiNet edge detection to DocAligner corner detection.

## What Changed

### Architecture

- **Before**: PiDiNet → Edge Map → Hough Lines/Contours → Corner Detection
- **After**: DocAligner → Direct Corner Coordinates

### Benefits

1. **Simpler Pipeline**: Direct corner detection eliminates complex post-processing
2. **Better Accuracy**: DocAligner is specifically trained for document corner detection
3. **Faster Processing**: Fewer processing steps mean better performance
4. **More Reliable**: No more amplification errors from edge detection

## Available Models

The following DocAligner models are included:

### Heatmap Models (Recommended)

- `lcnet100_h_e_bifpn_256_fp32.onnx` - Default, balanced speed and accuracy
- `fastvit_t8_h_e_bifpn_256_fp32.onnx` - Faster, smaller model
- `fastvit_sa24_h_e_bifpn_256_fp32.onnx` - Larger, more accurate

### Point Regression Models

- `lcnet050_p_multi_decoder_l3_d64_256_fp32.onnx` - Lightweight point regression

## Configuration

### Default Model (in nuxt.config.ts)

```typescript
export default defineNuxtConfig({
  modules: ['nuxt-document-scanner'],
  nuxtDocumentScanner: {
    model: {
      name: 'lcnet100_h_e_bifpn_256_fp32',
    },
    inference: {
      prefer: 'webgpu',
      targetResolution: 256, // DocAligner uses 256x256
    },
  },
})
```

### Custom Model

```typescript
export default defineNuxtConfig({
  nuxtDocumentScanner: {
    model: {
      name: 'fastvit_t8_h_e_bifpn_256_fp32', // Faster model
    },
  },
})
```

## Removed Features

The following features were removed as they are no longer needed:

1. **Edge Detection Parameters**: All `edgeDetection.*` configuration options

   - `threshold`, `houghThreshold`, `minLineLength`, `maxLineGap`
   - `minAreaPercent`, `maxAreaPercent`, `minRectangularity`
   - `useContours`

2. **Edge View Mode**: The "EDGES" debug view is no longer available

3. **Edge Map Processing**: All edge map generation and processing code

## Code Changes

### Worker

- `edge.worker.ts` → `corner.worker.ts`
- Outputs corner coordinates instead of edge maps
- Supports both point regression and heatmap models

### Composable

- `useDocumentScanner` now receives corners directly from worker
- Removed `detectQuadWithHoughLines` calls
- Simplified detection pipeline

### Components

- Removed `DocumentScannerEdges` component usage
- Removed edge view mode
- Simplified mode switching (camera/preview only)

## Performance

DocAligner models typically provide:

- **Better detection accuracy** - trained specifically for documents
- **Faster processing** - simpler pipeline
- **More stable results** - direct corner prediction reduces jitter

## Troubleshooting

### Model Not Loading

- Ensure the model file exists in `/public/models/`
- Check browser console for ONNX runtime errors
- Try switching from 'webgpu' to 'wasm' execution provider

### Poor Detection

- Try a different model (larger models are more accurate)
- Ensure good lighting conditions
- Make sure document has clear edges

## References

- [DocAligner GitHub](https://github.com/DocsaidLab/DocAligner)
- [DocAligner Documentation](https://docsaid.org/en/playground/docaligner-demo/)
