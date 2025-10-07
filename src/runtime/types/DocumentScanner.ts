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
