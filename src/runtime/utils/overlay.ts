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

export const drawOverlay = (opts: DrawOverlayOptions) => {
  const { canvas, containerSize, streamSize, corners, style } = opts
  if (!corners || corners.length !== 8) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = containerSize.width
  canvas.height = containerSize.height
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const s = { ...defaultStyle, ...style } as Required<OverlayDrawStyle>

  const xScale = containerSize.width / streamSize.width
  const yScale = streamSize.height / containerSize.height

  const [x0, y0, x1, y1, x2, y2, x3, y3] = corners.map((v, i) =>
    typeof v === 'number' && !Number.isNaN(v)
      ? v * (i % 2 === 0 ? xScale : yScale)
      : 0,
  ) as [number, number, number, number, number, number, number, number]

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
