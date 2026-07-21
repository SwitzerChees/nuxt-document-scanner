import type { Document, DocumentPdfOutput } from '../types'
import type { PDFDocument as PdfDocument } from 'pdf-lib'

export type PdfPageSize = 'auto' | 'a4'

export type PdfExportOptions = {
  fileName?: string
  imageQuality?: number
  margin?: number
  pageSize?: PdfPageSize
  title?: string
  author?: string
}

export type PdfImagePage = {
  data?: string | Blob | Uint8Array
  /** @deprecated Use `data`. */
  dataUrl?: string
  width: number
  height: number
}

export type PdfPageLayout = {
  pageWidth: number
  pageHeight: number
  imageX: number
  imageY: number
  imageWidth: number
  imageHeight: number
}

const A4_PORTRAIT = {
  width: 595.28,
  height: 841.89,
}

const DEFAULT_FILE_NAME = 'scan.pdf'

const normalizeFileName = (fileName?: string) => {
  const base = fileName?.trim() || DEFAULT_FILE_NAME
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`
}

const loadPdfLib = async () => {
  return (await import(
    'pdf-lib/dist/pdf-lib.esm.js'
  )) as typeof import('pdf-lib')
}

export const resolvePdfPageLayout = (
  sourceWidth: number,
  sourceHeight: number,
  options: Pick<PdfExportOptions, 'margin' | 'pageSize'> = {},
): PdfPageLayout => {
  const pageSize = options.pageSize || 'a4'
  const margin = Math.max(0, options.margin ?? 0)

  if (pageSize === 'auto') {
    return {
      pageWidth: sourceWidth,
      pageHeight: sourceHeight,
      imageX: 0,
      imageY: 0,
      imageWidth: sourceWidth,
      imageHeight: sourceHeight,
    }
  }

  const landscape = sourceWidth > sourceHeight
  const pageWidth = landscape ? A4_PORTRAIT.height : A4_PORTRAIT.width
  const pageHeight = landscape ? A4_PORTRAIT.width : A4_PORTRAIT.height
  const maxWidth = Math.max(1, pageWidth - margin * 2)
  const maxHeight = Math.max(1, pageHeight - margin * 2)
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight)
  const imageWidth = sourceWidth * scale
  const imageHeight = sourceHeight * scale

  return {
    pageWidth,
    pageHeight,
    imageX: (pageWidth - imageWidth) / 2,
    imageY: (pageHeight - imageHeight) / 2,
    imageWidth,
    imageHeight,
  }
}

const embedImage = async (pdfDoc: PdfDocument, source: PdfImagePage) => {
  const input = source.data || source.dataUrl
  if (!input) throw new Error('PDF page has no image data.')
  const data = input instanceof Blob ? new Uint8Array(await input.arrayBuffer()) : input
  const isPng =
    (input instanceof Blob && input.type === 'image/png') ||
    (typeof input === 'string' && input.startsWith('data:image/png'))
  if (isPng) {
    return pdfDoc.embedPng(data)
  }
  return pdfDoc.embedJpg(data)
}

export const createPdfFromImages = async (
  pages: PdfImagePage[],
  options: PdfExportOptions = {},
) => {
  if (!pages.length) {
    throw new Error('Cannot create a PDF without pages.')
  }

  const { PDFDocument } = await loadPdfLib()
  const pdfDoc = await PDFDocument.create()
  pdfDoc.setCreator('nuxt-document-scanner')
  pdfDoc.setProducer('nuxt-document-scanner')
  if (options.title) pdfDoc.setTitle(options.title)
  if (options.author) pdfDoc.setAuthor(options.author)

  for (const source of pages) {
    const embeddedImage = await embedImage(pdfDoc, source)
    const layout = resolvePdfPageLayout(source.width, source.height, options)
    const page = pdfDoc.addPage([layout.pageWidth, layout.pageHeight])

    page.drawImage(embeddedImage, {
      x: layout.imageX,
      y: layout.imageY,
      width: layout.imageWidth,
      height: layout.imageHeight,
    })
  }

  return pdfDoc.save()
}

export const documentToPdfImagePages = (
  document: Document,
) => {
  return document.pages.map((page) => ({
    data: page.processed,
    width: page.outputWidth,
    height: page.outputHeight,
  }) satisfies PdfImagePage)
}

const createPdfFromDocumentInWorker = (
  document: Document,
  options: PdfExportOptions,
) => {
  if (!import.meta.client || typeof Worker === 'undefined') return undefined
  const requestId = Date.now()
  const worker = new Worker(new URL('../workers/pdf.worker.js', import.meta.url), {
    type: 'module',
  })
  return new Promise<Uint8Array>((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.terminate()
      reject(new Error('PDF export timed out.'))
    }, 30_000)
    worker.addEventListener('message', (event) => {
      if (event.data?.requestId !== requestId) return
      clearTimeout(timeout)
      worker.terminate()
      if (event.data.type === 'error') {
        reject(new Error(event.data.error || 'PDF export failed.'))
        return
      }
      resolve(new Uint8Array(event.data.bytes as ArrayBuffer))
    })
    worker.addEventListener('error', (event) => {
      clearTimeout(timeout)
      worker.terminate()
      reject(new Error(event.message || 'PDF export worker failed.'))
    })
    worker.postMessage({
      requestId,
      pages: document.pages.map((page) => ({
        data: page.processed,
        width: page.outputWidth,
        height: page.outputHeight,
      })),
      options,
    })
  })
}

export const createPdfFromDocument = async (
  document: Document,
  options: PdfExportOptions = {},
): Promise<DocumentPdfOutput> => {
  const fileName = normalizeFileName(options.fileName)
  const workerResult = createPdfFromDocumentInWorker(document, options)
  const bytes = workerResult
    ? await workerResult
    : await createPdfFromImages(documentToPdfImagePages(document), options)
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], {
    type: 'application/pdf',
  })
  const file =
    typeof File === 'undefined'
      ? undefined
      : new File([blob], fileName, { type: 'application/pdf' })

  return {
    blob,
    bytes,
    file,
    fileName,
  }
}

export const createPdfFileFromDocument = async (
  document: Document,
  options: PdfExportOptions = {},
) => {
  const output = await createPdfFromDocument(document, options)
  if (!output.file) {
    throw new Error('File creation is not available in this environment.')
  }
  return output.file
}
