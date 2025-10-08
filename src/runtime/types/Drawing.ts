export type OverlayDrawStyle = {
  strokeColor?: string
  strokeWidth?: number
  fillColor?: string
  shadowBlur?: number
  shadowColor?: string
  gradient?: boolean
  pulse?: boolean
}

export type DrawOverlayOptions = {
  canvas: HTMLCanvasElement
  containerSize: { width: number; height: number }
  streamSize: { width: number; height: number }
  corners: number[] | undefined
  style?: OverlayDrawStyle
}
