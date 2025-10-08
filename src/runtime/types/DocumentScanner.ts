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

export type DocumentScannerOptions = {
  overlay: Ref<HTMLCanvasElement | undefined>
  video: Ref<HTMLVideoElement | undefined>
  videoOptions: {
    resizeDelay: number
    facingMode: 'environment' | 'user'
  }
  opencvUrl: string
  worker: WorkerOptions
}

export type DocumentScannerVideoOptions = {
  video: Ref<HTMLVideoElement | undefined>
  resizeDelay: number
  facingMode: 'environment' | 'user'
}

export type DocumentScannerCornerDetectionOptions = {
  overlay: Ref<HTMLCanvasElement | undefined>
  opencvUrl: string
  worker: WorkerOptions
}
