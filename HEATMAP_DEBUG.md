# Heatmap Debug Mode

## Overview

Added heatmap visualization mode for debugging DocAligner corner detection. This allows you to see what the model "sees" when detecting document corners.

## What Was Added

### 1. Heatmap Visualization Mode

- Toggle between **CAMERA** and **HEATMAPS** modes
- Displays 4 heatmaps in a 2x2 grid (one for each corner)
- Uses hot colormap (black → red → yellow → white) for better visibility
- Works only with heatmap models (`_h_` models), not point regression (`_p_`) models

### 2. Enhanced Console Logging

The worker now logs detailed information about:

#### Model Initialization

```
📊 Model info: {
  inputName: "input",
  inputChannels: 3,
  modelType: "heatmap",
  executionProvider: "wasm"
}
```

#### Each Inference

```
🔍 Inference input: {
  originalSize: "1920x1080",
  processedSize: "256x256",
  scale: "0.133",
  modelType: "heatmap"
}

⚡ Inference time: 45.2ms

📦 Model output shape: [1, 4, 64, 64]

📊 Heatmap shape: {
  format: "[B,C,H,W]",
  numPoints: 4,
  height: 64,
  width: 64
}

📍 Corner 0: {
  heatmapPos: "(15, 20)",
  imagePos: "(240.0, 320.0)",
  confidence: "0.943"
}
📍 Corner 1: { ... }
📍 Corner 2: { ... }
📍 Corner 3: { ... }

✅ Heatmap corners: [240.0, 320.0, ...]
```

#### Detection Status (every 30 frames)

```
📊 Detection status: {
  quadDetected: true,
  confidence: "1.000",
  hasSmoothed: true
}
```

## How to Use

### 1. Switch to Heatmap Mode

- Click the **HEATMAPS** button at the top of the scanner
- Camera stays active, but shows heatmap visualization overlay
- Detected corners are based on heatmap peaks

### 2. Understanding the Heatmaps

**Grid Layout:**

```
┌──────────┬──────────┐
│ Top-Left │ Top-Right│
├──────────┼──────────┤
│Bottom-Lft│Bottom-Rgt│
└──────────┴──────────┘
```

**Color Meaning:**

- **Black**: Low confidence (model doesn't think corner is here)
- **Red**: Medium confidence
- **Yellow**: High confidence
- **White**: Very high confidence (peak)

### 3. Reading Console Logs

Open browser DevTools (F12) and watch the console for:

- Model type detection
- Inference timing
- Corner positions in both heatmap and image coordinates
- Confidence values for each corner

## Troubleshooting

### "Point Regression Model - No heatmaps available"

You're using a point regression model (like `lcnet050_p_*`). These models output coordinates directly without heatmaps. Switch to a heatmap model:

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  nuxtDocumentScanner: {
    model: {
      name: 'lcnet100_h_e_bifpn_256_fp32', // ← has "_h_" for heatmap
    },
  },
})
```

### Detected Corners Are Off

Check the console logs:

1. **Look at heatmap positions**: Are the peaks in reasonable locations?
2. **Check confidence values**: Low confidence (<0.5) might indicate poor detection
3. **Verify scale factor**: Should match the ratio between original and processed image
4. **Check image coordinates**: These are the final corner positions

### Performance Issues

Heatmap generation adds overhead:

- Disable heatmap mode when not debugging
- Heatmaps are only generated when `HEATMAPS` mode is active
- Use smaller models for faster processing

## Models Comparison

### Heatmap Models (Support Debug Mode)

- `lcnet100_h_e_bifpn_256_fp32.onnx` - Default, 4.8 MB
- `fastvit_t8_h_e_bifpn_256_fp32.onnx` - Faster, 13.2 MB
- `fastvit_sa24_h_e_bifpn_256_fp32.onnx` - Most accurate, 83 MB

### Point Regression Models (No Heatmaps)

- `lcnet050_p_multi_decoder_l3_d64_256_fp32.onnx` - Direct corners, 4.9 MB

## Technical Details

### Heatmap Resolution

DocAligner models typically output heatmaps at 64x64 resolution for 256x256 input images. This means:

- Each heatmap pixel represents a 4x4 region in the input
- Corner positions have ~4 pixel accuracy at input resolution
- Corners are upscaled to original image resolution

### Peak Detection

The worker finds the maximum value in each heatmap:

```typescript
for each corner:
  maxValue = -∞
  for each pixel in heatmap:
    if value > maxValue:
      maxValue = value
      save position

  scale position to original image
```

### Visualization Generation

Hot colormap mapping:

- 0.00 - 0.33: Black → Red
- 0.33 - 0.66: Red → Yellow
- 0.66 - 1.00: Yellow → White

## Benefits

1. **Visual Debugging**: See exactly what the model sees
2. **Confidence Analysis**: Identify weak detections
3. **Model Comparison**: Compare different models visually
4. **Training Feedback**: Understand model behavior for improvements

## Example Console Output

```
🔧 Initializing ONNX Runtime: { prefer: "webgpu", isMobile: false, threads: 4 }
✅ ONNX session created with backend: wasm
📊 Model info: { inputName: "input", inputChannels: 3, modelType: "heatmap", executionProvider: "wasm" }
🔍 Inference input: { originalSize: "1280x720", processedSize: "256x256", scale: "0.200", modelType: "heatmap" }
⚡ Inference time: 42.3ms
📦 Model output shape: [1, 4, 64, 64]
📊 Heatmap shape: { format: "[B,C,H,W]", numPoints: 4, height: 64, width: 64 }
📍 Corner 0: { heatmapPos: "(12, 18)", imagePos: "(60.0, 90.0)", confidence: "0.954" }
📍 Corner 1: { heatmapPos: "(51, 16)", imagePos: "(255.0, 80.0)", confidence: "0.921" }
📍 Corner 2: { heatmapPos: "(53, 47)", imagePos: "(265.0, 235.0)", confidence: "0.887" }
📍 Corner 3: { heatmapPos: "(10, 49)", imagePos: "(50.0, 245.0)", confidence: "0.912" }
✅ Heatmap corners: [60.0, 90.0, 255.0, 80.0, 265.0, 235.0, 50.0, 245.0]
📊 Detection status: { quadDetected: true, confidence: "1.000", hasSmoothed: true }
```
