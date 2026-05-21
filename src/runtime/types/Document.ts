export type DocumentType = 'image' | 'pdf'
export type DocumentFormat = 'jpg' | 'png' | 'pdf'

export type Document = {
  id: string
  type: DocumentType
  format: DocumentFormat
  createdAt: number
  updatedAt: number
  pages: DocumentPage[]
}

export type DocumentPage = {
  id: string
  original: ImageData
  type: DocumentType
  format: DocumentFormat
  processed: ImageData | undefined
  quad: number[]
  timestamp: number
  thumbnail?: string
  width?: number
  height?: number
}

export type DocumentPdfOutput = {
  blob: Blob
  bytes: Uint8Array
  file?: File
  fileName: string
}
