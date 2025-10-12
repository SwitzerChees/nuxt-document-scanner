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
  video: HTMLVideoElement
  corners: number[] | undefined
  style?: OverlayDrawStyle
}

export type Point = {
  x: number
  y: number
}
