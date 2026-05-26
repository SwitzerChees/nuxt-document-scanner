import type { Ref } from 'vue'

export type DocumentScannerMode = 'camera' | 'preview'

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
