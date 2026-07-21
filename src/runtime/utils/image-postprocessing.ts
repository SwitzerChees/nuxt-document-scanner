export const imageDataToCanvas = (imageData: ImageData, maxSize?: number) => {
  const canvas = document.createElement('canvas')
  const scale =
    maxSize && Math.max(imageData.width, imageData.height) > maxSize
      ? maxSize / Math.max(imageData.width, imageData.height)
      : 1
  canvas.width = Math.max(1, Math.round(imageData.width * scale))
  canvas.height = Math.max(1, Math.round(imageData.height * scale))
  const context = canvas.getContext('2d')
  if (!context) return
  if (scale === 1) {
    context.putImageData(imageData, 0, 0)
  } else {
    const source = document.createElement('canvas')
    source.width = imageData.width
    source.height = imageData.height
    const sourceContext = source.getContext('2d')
    if (!sourceContext) return
    sourceContext.putImageData(imageData, 0, 0)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(source, 0, 0, canvas.width, canvas.height)
    source.width = 1
    source.height = 1
  }
  return canvas
}

export const imageDataToDataUrl = (
  imageData: ImageData,
  format: 'image/png' | 'image/jpeg' = 'image/jpeg',
  quality = 0.8,
  maxSize?: number,
) => imageDataToCanvas(imageData, maxSize)?.toDataURL(format, quality) || ''

export const imageDataToBlob = (
  imageData: ImageData,
  format: 'image/png' | 'image/jpeg' = 'image/jpeg',
  quality = 0.88,
  maxSize?: number,
) =>
  new Promise<Blob>((resolve, reject) => {
    const canvas = imageDataToCanvas(imageData, maxSize)
    if (!canvas) {
      reject(new Error('Could not create a canvas for the image.'))
      return
    }
    canvas.toBlob(
      (blob) => {
        canvas.width = 1
        canvas.height = 1
        if (blob) resolve(blob)
        else reject(new Error('Could not encode the image.'))
      },
      format,
      quality,
    )
  })

export const getThumbnail = imageDataToDataUrl
