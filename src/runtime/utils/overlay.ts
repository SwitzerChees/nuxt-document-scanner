import type { DrawOverlayOptions, OverlayDrawStyle } from '../types/Drawing'

const defaultStyle = {
  strokeColor: '#38bdf8',
  strokeWidth: 2,
  fillColor: '#38bdf8',
  shadowBlur: 25,
  shadowColor: '#0ea5e9',
  gradient: true,
  pulse: true,
} satisfies OverlayDrawStyle

const calculateDisplayArea = (video: HTMLVideoElement) => {
  const videoAspect = video.videoWidth / video.videoHeight
  const containerAspect = video.clientWidth / video.clientHeight

  let displayWidth, displayHeight, offsetX, offsetY

  if (videoAspect > containerAspect) {
    // Video is wider - letterbox top/bottom
    displayWidth = video.clientWidth
    displayHeight = video.clientWidth / videoAspect
    offsetX = 0
    offsetY = (video.clientHeight - displayHeight) / 2
  } else {
    // Video is taller - pillarbox left/right
    displayHeight = video.clientHeight
    displayWidth = video.clientHeight * videoAspect
    offsetX = (video.clientWidth - displayWidth) / 2
    offsetY = 0
  }

  return { displayWidth, displayHeight, offsetX, offsetY }
}

export const drawOverlay = (opts: DrawOverlayOptions) => {
  const { canvas, video, corners, style } = opts
  if (!corners || corners.length !== 8) return
  if (!video.videoWidth || !video.videoHeight) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Size canvas to match container
  canvas.width = video.clientWidth
  canvas.height = video.clientHeight
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Calculate display area for coordinate transformation
  const { displayWidth, displayHeight, offsetX, offsetY } =
    calculateDisplayArea(video)

  const s = { ...defaultStyle, ...style } as Required<OverlayDrawStyle>

  // Transform corners from stream coordinates to display coordinates
  const scaleX = displayWidth / video.videoWidth
  const scaleY = displayHeight / video.videoHeight

  const [sx0, sy0, sx1, sy1, sx2, sy2, sx3, sy3] = corners as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]

  // Convert to display coordinates
  const x0 = sx0 * scaleX + offsetX
  const y0 = sy0 * scaleY + offsetY
  const x1 = sx1 * scaleX + offsetX
  const y1 = sy1 * scaleY + offsetY
  const x2 = sx2 * scaleX + offsetX
  const y2 = sy2 * scaleY + offsetY
  const x3 = sx3 * scaleX + offsetX
  const y3 = sy3 * scaleY + offsetY

  const time = Date.now() / 1000
  const pulse = s.pulse ? Math.sin(time * 3) * 0.3 + 0.7 : 1
  const opacityHex = Math.floor(0x66 * pulse)
    .toString(16)
    .padStart(2, '0')

  // Fancy gradient border
  if (s.gradient) {
    const grad = ctx.createLinearGradient(x0, y0, x2, y2)
    grad.addColorStop(0, '#38bdf8')
    grad.addColorStop(0.5, '#818cf8')
    grad.addColorStop(1, '#a855f7')
    ctx.strokeStyle = grad
  } else {
    ctx.strokeStyle = s.strokeColor
  }

  ctx.lineWidth = s.strokeWidth
  ctx.shadowBlur = s.shadowBlur
  ctx.shadowColor = s.shadowColor

  // Semi-transparent glowing fill
  ctx.fillStyle = `${s.fillColor}${opacityHex}`
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineTo(x3, y3)
  ctx.closePath()
  ctx.fill()

  // Animated border pulse
  ctx.globalAlpha = pulse
  ctx.stroke()
  ctx.globalAlpha = 1

  // Corner highlights ✨
  const cornerGlow = (x: number, y: number) => {
    const size = 12 + Math.sin(time * 5) * 2
    const g = ctx.createRadialGradient(x, y, 0, x, y, size)
    g.addColorStop(0, 'rgba(255,255,255,0.9)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, size, 0, Math.PI * 2)
    ctx.fill()
  }

  cornerGlow(x0, y0)
  cornerGlow(x1, y1)
  cornerGlow(x2, y2)
  cornerGlow(x3, y3)
}
