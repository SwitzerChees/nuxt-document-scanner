# OmniSearch scanner quality port

Reference: `omnisearch/omnisearch-app`, revision `7d235224` (local master inspected on 18 October 2026),
`packages/document-scanner`. Target baseline: `840968d` on `codex-scanner-p0-p2`.
The reference checkout was only read. This document records the port and its validation.

## Findings

The target already had worker processing, blobs, editable corners and processing profiles.
The remaining difference was the camera and image pipeline, rather than a different model:
both copies of DocAligner have SHA-256 `f4117b786e3a18470f3865c93f3c2bd69d9b998edd60f385574a5c665e79594e`.

| Stage | Target baseline | Ported OmniSearch behavior |
| --- | --- | --- |
| Lens | Browser's environment camera | Prefer an iPhone virtual macro-capable lens / Android main focus camera; remember explicit selection |
| Video | 1920 px, 1280 px cap on iOS | Request up to 3840×2160; browser decides actual resolution |
| Detection | Main-thread canvas readback; bilinear BGR input, connected-component centroid | Transfer a GPU-resized bitmap; repeated-halving RGB input; local heatmap centroid with half-cell offset |
| Stability | Per-frame motion history plus a second countdown | Measure drift from the countdown anchor, wait for focus to recover, advise on tilt and frame borders; default 1.1 s total |
| Source | Single frame / temporary resolution constraints | Three video frames captured first; worker chooses the sharpest across centre and corners; optional still photo |
| Still photo | Independent final detection | Detect in the photo's own coordinates; accept only if a fresh video detection confirms the page stayed still; remember slow cameras |
| Crop | Model coordinates | Full-resolution edge search, robust line fitting and intersections before bilinear rectification |
| Enhancement | Global contrast, denoising and sharpening | Per-channel local paper estimation, shadow and paper-tint removal while retaining coloured ink; no blur pass |
| Review | Full processed image used as preview | 1280 px preview, separate thumbnail; no-reference blur check at 1400 px; edits reuse the original JPEG without recompressing it |
| Runtime | ORT 1.18 | ORT 1.30 and its matching WASM, single thread without cross-origin isolation |

The engine and its regression tests were brought over from the reference; the Nuxt composables adapt it to the
existing public `Document`, `DocumentPage`, component events, theme/messages, slots and profile API.
`document` uses the reference's `enhanced` filter. `original`, `color`, `grayscale` and `black-and-white` remain
available. Manual corners are never snapped again. A failed detection still permits manual full-frame capture.
White paper by itself no longer triggers a glare warning. Storage is limited to 20 pages / 80 MiB including
originals, previews and the delete-undo buffer. The existing pdf-lib export retains margin, sizing and metadata
options and embeds the processed JPEG without a quality-changing re-encode.

The camera additionally guards cancellation while device names are being enumerated and closes partial bursts.
Automatic capture and torch have accessible toggles; tap-to-focus is offered by the engine where supported.

## Validation

The local unit, type, lint, production-build and package checks succeeded (83 tests). The engine tests cover sub-cell
heatmaps, perspective geometry, refinement, one-pixel detail and colour preservation, shadow correction,
focus/tilt/motion capture decisions, blur checks, camera selection and worker request cancellation.

Physical iPhone/Android optics, autofocus, thermal limits and long-document memory behavior still need device
acceptance. Browser fixtures prove data flow and output resolution, not camera-app-equivalent image quality.

## Maintenance

Engine origin and rationale: `omnisearch-app/docs/document-scanner.md` and the reference package README.
The imported implementation is MIT; the unchanged model is Apache-2.0 and ONNX Runtime is MIT.
The runtime assets now use `/nuxt-document-scanner/v0.7.0/`; their checksums are in the bundled manifest.
Changing the runtime or model requires matching WASM bytes and a fresh asset version.

## Browser evidence (local Chromium production build)

- Real DocAligner WASM inference, real image worker and real PDF worker; runtime shim and WASM served with correct MIME types.
- Local fixture camera: 640×853 video and an independent 2400×3200 still; automatic capture accepted the still and refined all four edges.
- Result before rotation: 1800×932; after rotation: 932×1800. Crop Apply and a grayscale profile change completed in workers.
- Original JPEG checksum stayed unchanged across edits; edited corners had `refinedEdges: 0`.
- Exported PDF parsed successfully: one page, 216,533 bytes, embedded JPEG dimensions 932×1800. The original remained available after export.
- Removing the target from view and presenting it again produced the second page. A second PDF parsed as two pages (476,527 bytes), embedding 932×1800 and 1800×932 JPEGs; all camera tracks were ended during review.
- No observed main-thread tasks longer than 50 ms during this instrumented desktop run. This is not a mobile latency guarantee.
- Camera and review inspected at 390×844 and 1280×900; new controls passed the UI mechanical check.

The fixture upscales the existing **512×512 reference image**. Its soft appearance and blur warning are expected;
the test proves which input and dimensions reach the PDF, not new optical detail from upscaling.

Reproduce the local camera with `bun scripts/browser-fixture.ts > /tmp/scanner-fixture.js`, open the playground
on localhost, run that script in the browser before opening the scanner, then start scanning. With agent-browser,
use `agent-browser eval --stdin < /tmp/scanner-fixture.js`. `window.scannerFixture` exposes timings, the last
worker result and `hide(true/false)` to remove/present a page. No remote service or real document is involved.

## Demo deployment

Both root and playground pin ONNX Runtime 1.30. CI and CD use frozen lockfiles, Bun 1.4.2 and Node 22,
run lint, tests and typechecks, and generate the static playground with `bun run dev:generate`.
The PR workflow deploys the existing TEST site; pushes to master deploy the main demo once.
Netlify CLI uses the playground configuration and uploads the already generated files without rebuilding.
Runtime assets and missing JS/WASM requests have dedicated cache, MIME and 404 handling.
`/build-info.json` records the deployed commit and scanner asset version for readback verification.
