import type { Ref } from 'vue'

export type DocumentScannerMode = 'camera' | 'preview' | 'heatmaps'

export type DocumentScannerProps = {
  showTopControls?: boolean
  autoStart?: boolean
}

type WorkerOptions = {
  modelPath: string
  onnxPath: string
  modelResolution: number
  prefer: 'webgpu' | 'wasm'
  inputName: string
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
  resizeDelay: number
  facingMode: 'environment' | 'user'
}

export type DocumentScannerCornerDetectionOptions = {
  opencvUrl: string
  worker: WorkerOptions
  capture: CaptureOptions
}
