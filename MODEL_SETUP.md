# Model Setup Guide

## Overview

DocAligner models need to be accessible via HTTP at runtime. The setup differs between **development** (working on the module) and **production** (module installed in an app).

## Development (Module Workspace)

### Location

Models must be in: `playground/public/models/*.onnx`

### Why?

- The playground is a Nuxt app that consumes the module
- Nuxt serves files from `/public/` as static assets
- ONNX Runtime loads models via fetch() from `/models/` URL path

### Setup

```bash
# From module root
mkdir -p playground/public/models
cp src/runtime/public/models/*.onnx playground/public/models/
```

### Verify

```bash
ls -lh playground/public/models/
# Should show:
# - fastvit_sa24_h_e_bifpn_256_fp32.onnx (79M)
# - fastvit_t8_h_e_bifpn_256_fp32.onnx (13M)
# - lcnet050_p_multi_decoder_l3_d64_256_fp32.onnx (4.7M)
# - lcnet100_h_e_bifpn_256_fp32.onnx (4.5M)
```

## Production (Module Installed in App)

### User Setup

When someone installs this module, they need to:

1. **Copy models to their app's public directory:**

```bash
# In their app
mkdir -p public/models
# Then copy models from node_modules or download from releases
```

2. **Configure model path in nuxt.config.ts:**

```typescript
export default defineNuxtConfig({
  modules: ['nuxt-document-scanner'],
  nuxtDocumentScanner: {
    model: {
      name: 'lcnet100_h_e_bifpn_256_fp32', // Default
    },
  },
})
```

3. **Model resolves to:** `/models/lcnet100_h_e_bifpn_256_fp32.onnx`

### Module Distribution Options

**Option 1: User Downloads Models**

```md
# In README

## Installation

1. Install the module:
   npm install nuxt-document-scanner

2. Download models from releases and place in public/models/
   - Required: lcnet100_h_e_bifpn_256_fp32.onnx (4.5M)
   - Optional: Other models for different performance characteristics
```

**Option 2: Postinstall Script**

```json
// package.json
{
  "scripts": {
    "postinstall": "node scripts/download-models.js"
  }
}
```

**Option 3: CDN Hosting**

```typescript
// User can specify full URL
export default defineNuxtConfig({
  nuxtDocumentScanner: {
    model: {
      path: 'https://cdn.example.com/models/lcnet100_h_e_bifpn_256_fp32.onnx',
    },
  },
})
```

## Model File Sizes

| Model                                           | Size | Type    | Use Case                 |
| ----------------------------------------------- | ---- | ------- | ------------------------ |
| `lcnet100_h_e_bifpn_256_fp32.onnx`              | 4.5M | Heatmap | Default, balanced        |
| `lcnet050_p_multi_decoder_l3_d64_256_fp32.onnx` | 4.7M | Point   | Lightweight, no heatmaps |
| `fastvit_t8_h_e_bifpn_256_fp32.onnx`            | 13M  | Heatmap | Faster, more accurate    |
| `fastvit_sa24_h_e_bifpn_256_fp32.onnx`          | 79M  | Heatmap | Most accurate, slower    |

## Troubleshooting

### "Failed to load model because protobuf parsing failed"

**Cause:** Model file not found or wrong path

**Solutions:**

1. **Check model exists:**

```bash
# Development
ls playground/public/models/

# Production (user's app)
ls public/models/
```

2. **Check browser Network tab:**

- Open DevTools → Network
- Filter by "onnx"
- Should see: `200 OK` for `/models/yourmodel.onnx`
- If `404`: Model file missing
- If `CORS error`: Model on different domain without CORS headers

3. **Check console for path:**

```
📥 Loading model from: /models/lcnet100_h_e_bifpn_256_fp32.onnx
```

4. **Verify file isn't corrupted:**

```bash
# Should show file size > 4MB
ls -lh public/models/*.onnx
```

### "Cross-origin isolation" warning

**Cause:** Multi-threading warning (can be ignored)

**Effect:** Model runs in single-threaded mode, slightly slower but works fine

**To Fix (Optional):**

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  nitro: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
})
```

### Models not loading in production build

**Cause:** Public directory not copied during build

**Solution:**

```bash
# Nuxt automatically copies public/ to .output/public/
# Verify after build:
ls .output/public/models/
```

## Best Practices

### Development

- Keep models in `src/runtime/public/models/` for version control
- Copy to `playground/public/models/` for testing
- Add `.gitignore` entry for `playground/public/models/` if models are large

### Distribution

- Document model requirements clearly
- Provide download links or CDN URLs
- Consider optional models for different performance needs
- Warn about file sizes (79M max)

### Performance

- Use smaller models for mobile (lcnet100)
- Use larger models for desktop (fastvit_sa24)
- Consider lazy loading models on demand
- Cache models in browser

## Example .gitignore

```gitignore
# Large model files (optional - depends on if you want to commit them)
playground/public/models/*.onnx

# Keep models in src for distribution
!src/runtime/public/models/*.onnx
```

## CI/CD Considerations

If models are not in git:

```yaml
# .github/workflows/test.yml
- name: Download models
  run: |
    mkdir -p playground/public/models
    curl -L -o playground/public/models/lcnet100_h_e_bifpn_256_fp32.onnx \
      https://releases/.../lcnet100_h_e_bifpn_256_fp32.onnx
```
