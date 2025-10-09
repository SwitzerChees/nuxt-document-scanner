import type { Ref } from 'vue'

export type DocumentScannerMode = 'camera' | 'preview' | 'heatmaps'

export type DocumentScannerProps = {
  showTopControls?: boolean
}

type WorkerOptions = {
  modelPath: string
  onnxPath: string
  modelResolution: number
  prefer: 'webgpu' | 'wasm'
  inputName: string
}

type CaptureOptions = {
  autoCapture: boolean
  stableMotionThreshold: number
  stableSignificantMotionThreshold: number
  maxMissedRectangles: number
  stableDuration: number
  delay: number
}

export type DocumentScannerOptions = {
  overlay: Ref<HTMLCanvasElement | undefined>
  video: Ref<HTMLVideoElement | undefined>
  videoOptions: {
    resizeDelay: number
    facingMode: 'environment' | 'user'
  }
  opencvUrl: string
  worker: WorkerOptions
  capture: CaptureOptions
}

export type DocumentScannerVideoOptions = {
  video: Ref<HTMLVideoElement | undefined>
  resizeDelay: number
  facingMode: 'environment' | 'user'
}

export type DocumentScannerCornerDetectionOptions = {
  opencvUrl: string
  overlay: Ref<HTMLCanvasElement | undefined>
  video: Ref<HTMLVideoElement | undefined>
  worker: WorkerOptions
  capture: CaptureOptions
}
