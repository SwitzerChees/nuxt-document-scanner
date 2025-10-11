export const getThumbnail = (
  imageData: ImageData,
  format: 'image/png' | 'image/jpeg' = 'image/jpeg',
  quality = 0.92,
) => {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return ''

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL(format, quality)
}

export const cropByCorners = (imageData: ImageData, corners: number[]) => {
  if (!imageData || corners.length !== 8) return undefined

  const xs = [corners[0], corners[2], corners[4], corners[6]] as number[]
  const ys = [corners[1], corners[3], corners[5], corners[7]] as number[]

  const minX = Math.max(Math.min(...xs), 0)
  const minY = Math.max(Math.min(...ys), 0)
  const maxX = Math.min(Math.max(...xs), imageData.width)
  const maxY = Math.min(Math.max(...ys), imageData.height)

  const width = maxX - minX
  const height = maxY - minY
  if (width <= 0 || height <= 0) return undefined

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined

  // draw original imageData into context
  ctx.putImageData(imageData, -minX, -minY)

  // extract cropped region as new ImageData
  return ctx.getImageData(0, 0, width, height)
}

export const copyImageData = (imageData: ImageData) => {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  ctx.putImageData(imageData, 0, 0)
  return ctx.getImageData(0, 0, imageData.width, imageData.height) as ImageData
}
