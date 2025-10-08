/**
 * Canvas Drawing Utilities
 * Handles overlay rendering for edge detection visualization
 */

export interface DrawStyle {
  strokeColor?: string
  strokeWidth?: number
  fillColor?: string
  cornerRadius?: number
  shadowBlur?: number
  shadowColor?: string
}

const defaultStyle: DrawStyle = {
  strokeColor: '#3b82f6', // Blue
  strokeWidth: 3,
  fillColor: '#3b82f6', // Blue
  cornerRadius: 8,
  shadowBlur: 8,
  shadowColor: 'rgba(0, 0, 0, 0.3)',
}

/**
 * Clear the entire canvas
 */
export function clearCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

export function draw(
  canvas: HTMLCanvasElement,
  quad: number[] | undefined,
  containerSize: { width: number; height: number },
  streamSize: { width: number; height: number },
): void {
  canvas.width = containerSize.width
  canvas.height = containerSize.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!quad || quad.length !== 8) return
  drawQuad(ctx, containerSize, streamSize, quad, defaultStyle)
}

/**
 * Draw a quadrilateral on canvas with semi-transparent fill
 */
export function drawQuad(
  ctx: CanvasRenderingContext2D,
  containerSize: { width: number; height: number },
  streamSize: { width: number; height: number },
  quad: number[] | undefined,
  style: DrawStyle = {},
): void {
  if (!quad || quad.length !== 8) return

  const xScale = containerSize.width / streamSize.width
  const yScale = streamSize.height / containerSize.height

  const [x0, y0, x1, y1, x2, y2, x3, y3] = quad.map((value, index) => {
    if (index % 2 === 0) {
      return value * xScale
    }
    return value * yScale
  })

  const s = { ...defaultStyle, ...style } as Required<DrawStyle>

  // Draw semi-transparent fill
  ctx.fillStyle = `${s.fillColor}33` // 20% opacity (33 in hex = ~20%)
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineTo(x3, y3)
  ctx.closePath()
  ctx.fill()

  // Draw border with shadow
  if (s.shadowBlur && s.shadowColor) {
    ctx.shadowColor = s.shadowColor
    ctx.shadowBlur = s.shadowBlur
  }

  ctx.lineWidth = s.strokeWidth!
  ctx.strokeStyle = s.strokeColor!
  ctx.stroke()

  // Reset shadow
  ctx.shadowBlur = 0

  // Draw corner circles
  ctx.fillStyle = s.fillColor!
  drawCorner(ctx, x0, y0, s.cornerRadius)
  drawCorner(ctx, x1, y1, s.cornerRadius)
  drawCorner(ctx, x2, y2, s.cornerRadius)
  drawCorner(ctx, x3, y3, s.cornerRadius)
}

/**
 * Draw a single corner indicator
 */
function drawCorner(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
): void {
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, 2 * Math.PI)
  ctx.fill()
}
