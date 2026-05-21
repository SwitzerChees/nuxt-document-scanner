import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import {
  createPdfFromImages,
  resolvePdfPageLayout,
} from '../src/runtime/utils/pdf'

const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

describe('PDF export', () => {
  it('creates one PDF page for each scanned image', async () => {
    const bytes = await createPdfFromImages(
      [
        { dataUrl: ONE_PIXEL_PNG, width: 1000, height: 1400 },
        { dataUrl: ONE_PIXEL_PNG, width: 1400, height: 1000 },
      ],
      { pageSize: 'a4', margin: 18 },
    )

    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBe(2)
  })

  it('keeps portrait and landscape pages inside A4 bounds', () => {
    const portrait = resolvePdfPageLayout(1000, 1400, {
      pageSize: 'a4',
      margin: 24,
    })
    const landscape = resolvePdfPageLayout(1400, 1000, {
      pageSize: 'a4',
      margin: 24,
    })

    expect(portrait.pageHeight).toBeGreaterThan(portrait.pageWidth)
    expect(landscape.pageWidth).toBeGreaterThan(landscape.pageHeight)
    expect(portrait.imageWidth).toBeLessThanOrEqual(portrait.pageWidth - 48)
    expect(landscape.imageHeight).toBeLessThanOrEqual(landscape.pageHeight - 48)
  })
})
