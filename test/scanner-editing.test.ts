import { afterEach, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { usePostprocessing } from '../src/runtime/composables/usePostprocessing'
import type { DocumentPage } from '../src/runtime/types'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('sends Vue page coordinates as cloneable values and keeps the original when editing', async () => {
  const original = new Blob(['original'], { type: 'image/jpeg' })
  let payload: any
  class FakeWorker {
    onmessage?: (event: any) => void
    terminate() {}
    postMessage(message: any) {
      // Exactly the browser's boundary: proxy arrays throw a DataCloneError here.
      const cloned = structuredClone(message)
      payload = cloned.payload
      queueMicrotask(() => this.onmessage?.({ data: { id: message.id, result: {
        source: original, processed: original, preview: original, thumbnail: original,
        sourceWidth: 100, sourceHeight: 200, outputWidth: 200, outputHeight: 100,
        corners: [0, 0, 99, 0, 99, 199, 0, 199],
        quality: { quadConfidence: 0.9, warnings: [], acceptableForAutoCapture: true }, recipe: { version: 2 },
      } } }))
    }
  }
  vi.stubGlobal('Worker', FakeWorker)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const processor = usePostprocessing({ maxOutputPixels: 8_000_000, maxOutputLongEdge: 3200, jpegQuality: 0.94, thumbnailLongEdge: 360 })
  const page = reactive({ id: 'kept', source: original, quad: [0, 0, 1, 0, 1, 1, 0, 1],
    profile: 'document', rotation: 0, quality: { quadConfidence: 0.9 } }) as DocumentPage
  try {
    const result = await processor.replacePage(page, { rotation: 90 })
    expect(payload.normalizedQuad).toEqual(page.quad)
    expect(payload.source.size).toBe(original.size)
    expect(payload.options.refine).toBe(false)
    expect(payload.options.rotation).toBe(90)
    expect(result.id).toBe('kept')
    expect(result.source).toBe(original)
    processor.revokePageUrls(result)
  } finally { processor.dispose() }
})
