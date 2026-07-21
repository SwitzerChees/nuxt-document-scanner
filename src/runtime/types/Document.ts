export type DocumentType = 'image' | 'pdf'
export type DocumentFormat = 'jpg' | 'png' | 'pdf'
export type DocumentProcessingProfile =
  | 'original'
  | 'color'
  | 'document'
  | 'grayscale'
  | 'black-and-white'

export type QualityWarning =
  | 'move-closer'
  | 'hold-still'
  | 'too-dark'
  | 'glare'
  | 'corners-missing'

export type QualityAssessment = {
  quadConfidence: number
  coverage: number
  sharpness: number
  exposure: number
  glare: number
  motion: number
  acceptableForAutoCapture: boolean
  warnings: QualityWarning[]
}

export type ProcessingRecipe = {
  version: number
  parameters: Record<string, number | string>
}

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
  type: DocumentType
  format: DocumentFormat
  source?: Blob
  processed: Blob
  thumbnail: Blob
  sourceUrl?: string
  previewUrl: string
  thumbnailUrl: string
  sourceWidth: number
  sourceHeight: number
  outputWidth: number
  outputHeight: number
  quad: number[]
  rotation: 0 | 90 | 180 | 270
  profile: DocumentProcessingProfile
  processingRecipe: ProcessingRecipe
  quality: QualityAssessment
  needsReview: boolean
  timestamp: number
}

export type DocumentPdfOutput = {
  blob: Blob
  bytes: Uint8Array
  file?: File
  fileName: string
}
