/// <reference lib="webworker" />
import { PDFDocument } from 'pdf-lib/dist/pdf-lib.esm.js'
import { resolvePdfPageLayout, type PdfExportOptions } from '../utils/pdf'

type PdfWorkerMessage = {
  requestId: number
  pages: Array<{ data: Blob; width: number; height: number }>
  options: PdfExportOptions
}

const workerScope = self as unknown as DedicatedWorkerGlobalScope

workerScope.addEventListener('message', async (event: MessageEvent<PdfWorkerMessage>) => {
  const { requestId, pages, options } = event.data
  try {
    if (!pages.length) throw new Error('Cannot create a PDF without pages.')
    const pdf = await PDFDocument.create()
    pdf.setCreator('nuxt-document-scanner')
    pdf.setProducer('nuxt-document-scanner')
    if (options.title) pdf.setTitle(options.title)
    if (options.author) pdf.setAuthor(options.author)
    for (const source of pages) {
      const data = new Uint8Array(await source.data.arrayBuffer())
      const image = source.data.type === 'image/png'
        ? await pdf.embedPng(data)
        : await pdf.embedJpg(data)
      const layout = resolvePdfPageLayout(source.width, source.height, options)
      const page = pdf.addPage([layout.pageWidth, layout.pageHeight])
      page.drawImage(image, {
        x: layout.imageX,
        y: layout.imageY,
        width: layout.imageWidth,
        height: layout.imageHeight,
      })
    }
    const bytes = await pdf.save()
    workerScope.postMessage(
      { type: 'result', requestId, bytes: bytes.buffer },
      [bytes.buffer],
    )
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      requestId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

export {}
