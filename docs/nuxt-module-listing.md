# Nuxt Module Listing Preparation

Use this content for the official module listing request after `0.6.0` is published to npm.

## Issue

Title:

```txt
[Module Listing Request]: `nuxt-document-scanner`
```

Description:

```txt
Nuxt Document Scanner is a Nuxt 4 module for mobile document scanning. It provides a mobile-first scanner UI, camera switching, ONNX Runtime document edge detection, worker-based perspective correction, corrective multi-page review, editable PDF file names, and PDF export from scanned pages.

The module serves a versioned ONNX model and the two required single-thread ONNX Runtime WASM files through Nuxt/Nitro public assets. The hosted playground demonstrates the complete scan-to-PDF flow on HTTPS.
```

Repository:

```txt
https://github.com/SwitzerChees/nuxt-document-scanner
```

npm:

```txt
https://www.npmjs.com/package/nuxt-document-scanner
```

Nuxt Compatibility:

```txt
Nuxt 4
```

## Registry Metadata Draft

This is not required for the issue form, but it is useful if maintainers ask for metadata or if a follow-up PR is needed.

```yaml
name: document-scanner
description: Nuxt 4 document scanner with mobile camera capture, ONNX edge detection, perspective correction, and PDF export.
repo: SwitzerChees/nuxt-document-scanner
npm: nuxt-document-scanner
github: https://github.com/SwitzerChees/nuxt-document-scanner
website: https://nuxt-document-scanner.netlify.app
learn_more: https://github.com/SwitzerChees/nuxt-document-scanner#readme
category: Images
type: 3rd-party
compatibility:
  nuxt: ^4.0.0
```

Recommended category: `Images`.
