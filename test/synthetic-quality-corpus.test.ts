import { describe, expect, it } from 'vitest'
import { validateDocumentQuad } from '../src/runtime/utils/document-geometry'
import { processDocumentPixels } from '../src/runtime/utils/processing-core'
import { createSyntheticQualityCorpus } from './fixtures/quality/synthetic-corpus'

describe('synthetic quality corpus', () => {
  const corpus = createSyntheticQualityCorpus()

  it('contains 64 deterministic, labeled scenarios', () => {
    expect(corpus).toHaveLength(64)
    expect(new Set(corpus.map((fixture) => fixture.id)).size).toBe(64)
    expect(new Set(corpus.flatMap((fixture) => fixture.tags)).size).toBeGreaterThanOrEqual(10)
  })

  it('accepts, warps, profiles, and assesses every labeled document', () => {
    for (const fixture of corpus) {
      const geometry = validateDocumentQuad(fixture.corners, {
        frameSize: fixture.imageData,
        minAreaRatio: 0.02,
        maxAspectRatio: 12,
      })
      expect(geometry.valid, fixture.id).toBe(true)
      const result = processDocumentPixels(fixture.imageData, fixture.corners, {
        profile: 'document',
        maxPixels: 200_000,
        maxLongEdge: 640,
        quadConfidence: 0.9,
      })
      expect(result, fixture.id).toBeDefined()
      expect(result!.imageData.width, fixture.id).toBeGreaterThan(40)
      expect(result!.imageData.height, fixture.id).toBeGreaterThan(40)
      expect(result!.imageData.data[3], fixture.id).toBe(255)
      expect(result!.quality.warnings, fixture.id).toEqual(expect.any(Array))
    }
  })
})
