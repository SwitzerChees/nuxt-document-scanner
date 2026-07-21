import type {
  DrawOverlayOptions,
  OverlayDrawStyle,
} from '../types/Drawing'
import {
  validateDocumentQuad,
  type DocumentQuadValidationOptions,
} from './document-geometry'

export { calculateQuadArea, emaQuad } from './document-geometry'

const defaultStyle = {
  strokeColor: '#FFFFFF',
  strokeWidth: 3,
  fillColor: '#38bdf8',
  shadowBlur: 25,
  shadowColor: '#0ea5e9',
  gradient: true,
  pulse: true,
} satisfies OverlayDrawStyle

export type VideoObjectFit = 'contain' | 'cover' | 'fill'

export type VideoDisplayArea = {
  displayWidth: number
  displayHeight: number
  offsetX: number
  offsetY: number
}

/**
 * Avoids turning a landscape camera stream into a heavily cropped portrait
 * preview. A small crop keeps the scanner immersive; an extreme crop hides
 * too much context for users to position the whole document reliably.
 */
export const resolvePreviewObjectFit = (
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number,
  minimumVisibleFraction = 0.7,
): Extract<VideoObjectFit, 'contain' | 'cover'> => {
  if (!videoWidth || !videoHeight || !containerWidth || !containerHeight) {
    return 'cover'
  }

  const videoAspect = videoWidth / videoHeight
  const containerAspect = containerWidth / containerHeight
  const visibleFraction = Math.min(
    videoAspect / containerAspect,
    containerAspect / videoAspect,
  )
  return visibleFraction < minimumVisibleFraction ? 'contain' : 'cover'
}

export const resolveVideoDisplayArea = (
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number,
  objectFit: VideoObjectFit = 'cover',
): VideoDisplayArea => {
  if (!videoWidth || !videoHeight || !containerWidth || !containerHeight) {
    return {
      displayWidth: 0,
      displayHeight: 0,
      offsetX: 0,
      offsetY: 0,
    }
  }

  if (objectFit === 'fill') {
    return {
      displayWidth: containerWidth,
      displayHeight: containerHeight,
      offsetX: 0,
      offsetY: 0,
    }
  }

  const videoAspect = videoWidth / videoHeight
  const containerAspect = containerWidth / containerHeight
  const useWidth =
    objectFit === 'contain'
      ? videoAspect > containerAspect
      : videoAspect <= containerAspect

  if (useWidth) {
    const displayWidth = containerWidth
    const displayHeight = containerWidth / videoAspect
    return {
      displayWidth,
      displayHeight,
      offsetX: 0,
      offsetY: (containerHeight - displayHeight) / 2,
    }
  }

  const displayHeight = containerHeight
  const displayWidth = containerHeight * videoAspect
  return {
    displayWidth,
    displayHeight,
    offsetX: (containerWidth - displayWidth) / 2,
    offsetY: 0,
  }
}

const getVideoObjectFit = (video: HTMLVideoElement): VideoObjectFit => {
  const fit = window.getComputedStyle?.(video).objectFit
  if (fit === 'contain' || fit === 'fill') return fit
  return 'cover'
}

export const drawOverlay = (opts: DrawOverlayOptions) => {
  const { canvas, video, corners: newestCorners, style } = opts
  if (!video.videoWidth || !video.videoHeight) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const containerWidth = video.clientWidth
  const containerHeight = video.clientHeight
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  const canvasWidth = Math.max(1, Math.round(containerWidth * pixelRatio))
  const canvasHeight = Math.max(1, Math.round(containerHeight * pixelRatio))
  if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
    canvas.width = canvasWidth
    canvas.height = canvasHeight
  }
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  ctx.clearRect(0, 0, containerWidth, containerHeight)

  if (!newestCorners) {
    return
  }

  const corners = newestCorners
  if (corners.length !== 8) return

  const { displayWidth, displayHeight, offsetX, offsetY } =
    resolveVideoDisplayArea(
      video.videoWidth,
      video.videoHeight,
      containerWidth,
      containerHeight,
      getVideoObjectFit(video),
    )
  const s = { ...defaultStyle, ...style } as Required<OverlayDrawStyle>

  const scaleX = displayWidth / video.videoWidth
  const scaleY = displayHeight / video.videoHeight

  const [sx0, sy0, sx1, sy1, sx2, sy2, sx3, sy3] = corners
  const x0 = sx0! * scaleX + offsetX,
    y0 = sy0! * scaleY + offsetY
  const x1 = sx1! * scaleX + offsetX,
    y1 = sy1! * scaleY + offsetY
  const x2 = sx2! * scaleX + offsetX,
    y2 = sy2! * scaleY + offsetY
  const x3 = sx3! * scaleX + offsetX,
    y3 = sy3! * scaleY + offsetY

  const time = Date.now() / 1000
  const pulse = s.pulse ? Math.sin(time * 3) * 0.3 + 0.7 : 1
  const opacityHex = Math.floor(0x66 * pulse)
    .toString(16)
    .padStart(2, '0')

  ctx.strokeStyle = s.gradient
    ? (() => {
        const g = ctx.createLinearGradient(x0, y0, x2, y2)
        g.addColorStop(0, s.strokeColor)
        g.addColorStop(0.5, s.strokeColor)
        g.addColorStop(1, s.strokeColor)
        return g
      })()
    : s.strokeColor

  ctx.lineWidth = s.strokeWidth
  ctx.shadowBlur = s.shadowBlur
  ctx.shadowColor = s.shadowColor
  ctx.fillStyle = `${s.fillColor}${opacityHex}`

  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineTo(x3, y3)
  ctx.closePath()
  ctx.fill()

  ctx.globalAlpha = pulse
  ctx.stroke()
  ctx.globalAlpha = 1
}

export const isValidRectangle = (
  pts: number[],
  options: DocumentQuadValidationOptions = {},
) => validateDocumentQuad(pts, options).valid

export const calculateSignificantChange = (
  prev: number,
  next: number,
  threshold: number,
) => {
  if (prev == 0) return false
  const change = Math.abs(next - prev) / Math.max(prev, 1)
  return change > threshold
}
