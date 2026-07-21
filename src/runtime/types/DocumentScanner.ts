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

export type DocumentScannerProps = {
  autoStart?: boolean
  fileName?: string
}

type WorkerOptions = {
  modelPath: string
  onnxPath: string
  modelResolution: number
  prefer: 'webgpu' | 'wasm'
  threads: number
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
  opencvUrl: string
  worker: WorkerOptions
  capture: CaptureOptions
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
