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
  strokeColor: '#00ff88',
  strokeWidth: 4,
  fillColor: '#00ff88',
  cornerRadius: 6,
  shadowBlur: 4,
  shadowColor: 'rgba(0, 0, 0, 0.5)',
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
 * Draw a quadrilateral on canvas
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
    isNaN(x0) ||
    isNaN(y0) ||
    isNaN(x1) ||
    isNaN(y1) ||
    isNaN(x2) ||
    isNaN(y2) ||
    isNaN(x3) ||
    isNaN(y3)
  ) {
    return
  }

  const s = { ...defaultStyle, ...style }

  // Draw quad outline
  ctx.lineWidth = s.strokeWidth!
  ctx.strokeStyle = s.strokeColor!

  if (s.shadowBlur && s.shadowColor) {
    ctx.shadowColor = s.shadowColor
    ctx.shadowBlur = s.shadowBlur
  }

  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineTo(x3, y3)
  ctx.closePath()
  ctx.stroke()

  // Reset shadow
  ctx.shadowBlur = 0

  // Draw corner circles
  ctx.fillStyle = s.fillColor!
  drawCorner(ctx, x0, y0, s.cornerRadius!)
  drawCorner(ctx, x1, y1, s.cornerRadius!)
  drawCorner(ctx, x2, y2, s.cornerRadius!)
  drawCorner(ctx, x3, y3, s.cornerRadius!)
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

/**
 * Draw corner indicators at specific points
 */
export function drawCorners(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  style: DrawStyle = {},
): void {
  const s = { ...defaultStyle, ...style }
  ctx.fillStyle = s.fillColor!

  for (const point of points) {
    drawCorner(ctx, point.x, point.y, s.cornerRadius!)
  }
}

/**
 * Draw detection status indicator
 */
export function drawStatusIndicator(
  ctx: CanvasRenderingContext2D,
  detected: boolean,
  x: number,
  y: number,
  size = 12,
): void {
  ctx.fillStyle = detected ? '#00ff88' : '#ff4444'
  ctx.beginPath()
  ctx.arc(x, y, size / 2, 0, 2 * Math.PI)
  ctx.fill()

  // Add glow effect when detected
  if (detected) {
    ctx.shadowColor = '#00ff88'
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.arc(x, y, size / 2, 0, 2 * Math.PI)
    ctx.fill()
    ctx.shadowBlur = 0
  }
}

/**
 * Draw debug grid (useful for development)
 */
export function drawDebugGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  gridSize = 50,
): void {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
  ctx.lineWidth = 1

  // Vertical lines
  for (let x = 0; x < width; x += gridSize) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }

  // Horizontal lines
  for (let y = 0; y < height; y += gridSize) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
}
