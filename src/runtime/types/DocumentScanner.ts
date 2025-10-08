import type { Ref } from 'vue'

export type DocumentScannerMode = 'camera' | 'preview' | 'heatmaps'

export type DocumentScannerProps = {
  showTopControls?: boolean
}

export type DocumentScannerOptions = {
  overlay: Ref<HTMLCanvasElement | undefined>
  video: Ref<HTMLVideoElement | undefined>
  videoOptions: {
    resizeDelay: number
    facingMode: 'environment' | 'user'
  }
  opencvUrl: string
}

export type DocumentScannerVideoOptions = {
  video: Ref<HTMLVideoElement | undefined>
  resizeDelay: number
  facingMode: 'environment' | 'user'
}

export type DocumentScannerCornerDetectionOptions = {
  overlay: Ref<HTMLCanvasElement | undefined>
  opencvUrl: string
}
