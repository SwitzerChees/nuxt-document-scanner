import type { Ref } from 'vue'

export type DocumentScannerMode = 'camera' | 'preview' | 'heatmaps'

export type DocumentScannerProps = {
  showTopControls?: boolean
}

export type DocumentScannerOptions = {
  videoOptions: {
    resizeDelay: number
    facingMode: 'environment' | 'user'
  }
}

export type DocumentScannerVideoOptions = {
  video: Ref<HTMLVideoElement | undefined>
  resizeDelay: number
  facingMode: 'environment' | 'user'
}
