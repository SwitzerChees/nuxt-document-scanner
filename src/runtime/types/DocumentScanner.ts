import type { Ref } from 'vue'
import type { DocumentProcessingProfile } from './Document'

export type DocumentScannerMode = 'camera' | 'preview'

export type ScannerState =
  | 'idle'
  | 'requesting-permission'
  | 'camera-ready'
  | 'detector-loading'
  | 'live'
  | 'capturing'
  | 'processing'
  | 'paused'
  | 'error'

export type CaptureState = 'idle' | 'capturing' | 'processing' | 'success' | 'error'

export type ScannerErrorCode =
  | 'permission-denied'
  | 'camera-not-found'
  | 'camera-in-use'
  | 'insecure-context'
  | 'camera-start'
  | 'camera-interrupted'
  | 'detector-load'
  | 'capture-failed'
  | 'processing-failed'
  | 'export-failed'

export type ScannerError = {
  code: ScannerErrorCode
  message: string
  recoverable: boolean
  cause?: unknown
}

export type DocumentScannerMessages = {
  scannerLabel: string
  allowCamera: string
  loadingEdges: string
  pageCaptured: string
  manualCapture: string
  startingCamera: string
  moveCloser: string
  holdStill: string
  holdParallel: string
  moveBack: string
  autoCapture: string
  flashlight: string
  addLight: string
  reduceGlare: string
  ready: string
  alignEdges: string
  retry: string
  importPhoto: string
  close: string
  capture: string
  openPreview: string
  previousCamera: string
  nextCamera: string
  selectCamera: string
  processingPage: string
  capturingPage: string
  permissionDenied: string
  cameraNotFound: string
  cameraInUse: string
  insecureContext: string
  cameraUnavailable: string
  cameraInterrupted: string
  cameraErrorStatus: string
  discardTitle: string
  discardBody: string
  keepScanning: string
  discardPages: string
  reviewLabel: string
  pagesReady: string
  page: string
  pages: string
  noPages: string
  backToCamera: string
  deleteCurrentPage: string
  retake: string
  pageAdjustments: string
  look: string
  profileOriginal: string
  profileColor: string
  profileDocument: string
  profileGrayscale: string
  profileBlackAndWhite: string
  processed: string
  compare: string
  rotate: string
  crop: string
  zoomOut: string
  zoomIn: string
  resetZoom: string
  fitPage: string
  noScannedPages: string
  updatingPage: string
  previousPage: string
  nextPage: string
  pageOrder: string
  goToPage: string
  movePageLeft: string
  movePageRight: string
  scanMore: string
  creatingPdf: string
  createPdf: string
  finishScan: string
  pageDeleted: string
  undo: string
  exportPdf: string
  fileName: string
  name: string
  cancel: string
  adjustCorners: string
  apply: string
  cropHelp: string
  originalPageAlt: string
  corner: string
  warningMoveCloser: string
  warningHoldStill: string
  warningTooDark: string
  warningGlare: string
  warningCornersMissing: string
}

export type DocumentScannerTheme = Partial<{
  background: string
  surface: string
  text: string
  accent: string
  warning: string
  danger: string
  radius: string
}>

export type DocumentScannerProps = {
  autoStart?: boolean
  fileName?: string
  reviewAfterCapture?: 'never' | 'quality-warning' | 'always'
  defaultProfile?: DocumentProcessingProfile
  keepSource?: boolean
  exportUi?: boolean
  messages?: Partial<DocumentScannerMessages>
  theme?: DocumentScannerTheme
}

type WorkerOptions = {
  modelPath: string
  onnxPath: string
  modelResolution: number
  prefer: 'webgpu' | 'wasm'
  inputName: string
  detectionMaxSize: number
}
export type AutoCaptureOptions = {
  enabled: boolean
  delay: number
  cooldown: number
}

type CaptureOptions = {
  autoCapture: AutoCaptureOptions
  stableMotionThreshold: number
  stableSignificantMotionThreshold: number
  missedRectanglesDuration: number
  stableDuration: number
  minimumDetectionConfidence: number
  minimumDocumentAreaRatio: number
  maximumDocumentAspectRatio: number
  processingProfile: DocumentProcessingProfile
  maxOutputPixels: number
  maxOutputLongEdge: number
  jpegQuality: number
  thumbnailLongEdge: number
}

export type DocumentScannerOptions = {
  overlay: Ref<HTMLCanvasElement | undefined>
  videoOptions: DocumentScannerVideoOptions
  worker: WorkerOptions
  capture: CaptureOptions
  keepSource?: boolean
}

export type DocumentScannerVideoOptions = {
  video: Ref<HTMLVideoElement | undefined>
  resolution: number
  facingMode: 'environment' | 'user'
  highResolutionCapture?: {
    enabled?: boolean
    resolution?: number
    settleFrames?: number
    timeout?: number
  }
}

export type DocumentScannerCamera = {
  deviceId: string
  label: string
}

export type DocumentScannerCornerDetectionOptions = {
  worker: WorkerOptions
  capture: CaptureOptions
}

export type DeepRequired<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends object
    ? DeepRequired<NonNullable<T[K]>>
    : NonNullable<T[K]>
}
