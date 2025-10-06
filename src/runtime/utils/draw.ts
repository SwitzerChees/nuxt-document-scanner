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

/**
 * Draw a quadrilateral on canvas with semi-transparent fill
 */
export function drawQuad(
  ctx: CanvasRenderingContext2D,
  quad: number[] | undefined,
  style: DrawStyle = {},
): void {
  if (!quad || quad.length !== 8) return

  const [x0, y0, x1, y1, x2, y2, x3, y3] = quad

  // Validate coordinates
  if (
    x0 === undefined ||
    y0 === undefined ||
    x1 === undefined ||
    y1 === undefined ||
    x2 === undefined ||
    y2 === undefined ||
    x3 === undefined ||
    y3 === undefined ||
    Number.isNaN(x0) ||
    Number.isNaN(y0) ||
    Number.isNaN(x1) ||
    Number.isNaN(y1) ||
    Number.isNaN(x2) ||
    Number.isNaN(y2) ||
    Number.isNaN(x3) ||
    Number.isNaN(y3)
  ) {
    return
  }

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
