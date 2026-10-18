import { validateDocumentQuad } from '../src/runtime/utils/document-geometry'
import { processDocumentPixels } from '../src/runtime/utils/processing-core'
import { createSyntheticQualityCorpus } from '../test/fixtures/quality/synthetic-corpus'

const corpus = createSyntheticQualityCorpus()
const warnings: Record<string, number> = {}
let validGeometry = 0
let processed = 0
const startedAt = performance.now()

for (const fixture of corpus) {
  const geometry = validateDocumentQuad(fixture.corners, {
    frameSize: fixture.imageData,
    minAreaRatio: 0.02,
    maxAspectRatio: 12,
  })
  if (geometry.valid) validGeometry++
  const result = processDocumentPixels(fixture.imageData, fixture.corners, {
    profile: 'document',
    maxPixels: 200_000,
    maxLongEdge: 640,
    quadConfidence: 0.9,
  })
  if (!result) continue
  processed++
  for (const warning of result.quality.warnings) {
    warnings[warning] = (warnings[warning] || 0) + 1
  }
}

console.log(JSON.stringify({
  corpus: 'synthetic-quality-v1',
  fixtures: corpus.length,
  validGeometry,
  processed,
  warnings,
  elapsedMs: Math.round(performance.now() - startedAt),
}, null, 2))
