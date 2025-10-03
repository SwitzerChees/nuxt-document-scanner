// Image flattening using OpenCV perspective warp
export const flattenImage = (originalImage: ImageData, quad: number[]): ImageData | undefined => {
  if (!quad || quad.length !== 8) return undefined

  try {
    // @ts-ignore - cv from opencv.js
    const src = cv.matFromImageData(originalImage)

    // Order quad points: top-left, top-right, bottom-right, bottom-left
    const ordered = orderQuadPoints(quad)
    if (!ordered) {
      src.delete()
      return undefined
    }

    // Calculate output dimensions based on quad
    const widthTop = distance(ordered[0], ordered[1])
    const widthBottom = distance(ordered[3], ordered[2])
    const heightLeft = distance(ordered[0], ordered[3])
    const heightRight = distance(ordered[1], ordered[2])

    const maxWidth = Math.max(widthTop, widthBottom)
    const maxHeight = Math.max(heightLeft, heightRight)

    // KEEP THE ORIGINAL ASPECT RATIO - don't force A4
    let dstWidth = maxWidth
    let dstHeight = maxHeight

    // Use higher resolution for final output (up to 3000px for print quality)
    const scale = Math.min(3000 / dstWidth, 3000 / dstHeight, 3.0)
    dstWidth = Math.round(dstWidth * scale)
    dstHeight = Math.round(dstHeight * scale)

    // @ts-ignore
    const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      ordered[0].x,
      ordered[0].y, // top-left
      ordered[1].x,
      ordered[1].y, // top-right
      ordered[2].x,
      ordered[2].y, // bottom-right
      ordered[3].x,
      ordered[3].y, // bottom-left
    ])

    // @ts-ignore
    const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, dstWidth, 0, dstWidth, dstHeight, 0, dstHeight])

    // @ts-ignore
    const M = cv.getPerspectiveTransform(srcPoints, dstPoints)
    // @ts-ignore
    const dst = new cv.Mat()
    // @ts-ignore
    const dsize = new cv.Size(dstWidth, dstHeight)
    // @ts-ignore
    cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar())

    // Extract ImageData - KEEP THE COLOR VERSION!
    const canvas = document.createElement('canvas')
    canvas.width = dstWidth
    canvas.height = dstHeight
    // @ts-ignore
    cv.imshow(canvas, dst)
    const ctx = canvas.getContext('2d')!
    const imageData = ctx.getImageData(0, 0, dstWidth, dstHeight)

    // Cleanup
    src.delete()
    srcPoints.delete()
    dstPoints.delete()
    M.delete()
    dst.delete()

    return imageData
  } catch (e) {
    console.error('Failed to flatten image:', e)
    return undefined
  }
}

// Convert color image to B&W for OCR (optional preprocessing)
export const convertToBlackAndWhite = (imageData: ImageData): ImageData => {
  try {
    // @ts-ignore
    const src = cv.matFromImageData(imageData)
    // @ts-ignore
    const gray = new cv.Mat()
    // @ts-ignore
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

    // Adaptive threshold for clean text
    // @ts-ignore
    const binary = new cv.Mat()
    // @ts-ignore
    cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2)

    // Convert back to RGBA
    // @ts-ignore
    const result = new cv.Mat()
    // @ts-ignore
    cv.cvtColor(binary, result, cv.COLOR_GRAY2RGBA)

    // Extract ImageData
    const canvas = document.createElement('canvas')
    canvas.width = imageData.width
    canvas.height = imageData.height
    // @ts-ignore
    cv.imshow(canvas, result)
    const ctx = canvas.getContext('2d')!
    const bwImageData = ctx.getImageData(0, 0, imageData.width, imageData.height)

    // Cleanup
    src.delete()
    gray.delete()
    binary.delete()
    result.delete()

    return bwImageData
  } catch (e) {
    console.error('Failed to convert to B&W:', e)
    return imageData
  }
}

const orderQuadPoints = (quad: number[]) => {
  if (quad.length !== 8) return undefined

  const points = [
    { x: quad[0], y: quad[1] },
    { x: quad[2], y: quad[3] },
    { x: quad[4], y: quad[5] },
    { x: quad[6], y: quad[7] },
  ]

  // Sort by Y coordinate
  points.sort((a, b) => a.y - b.y)

  // Top two points
  const top = points.slice(0, 2).sort((a, b) => a.x - b.x)
  // Bottom two points
  const bottom = points.slice(2, 4).sort((a, b) => a.x - b.x)

  return [
    top[0], // top-left
    top[1], // top-right
    bottom[1], // bottom-right
    bottom[0], // bottom-left
  ]
}

const distance = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)
}

// Convert ImageData to base64 for embedding in PDF
export const imageDataToBase64 = (imageData: ImageData): string => {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.92)
}

// Get thumbnail for preview
export const createThumbnail = (imageData: ImageData, maxSize = 200): ImageData => {
  const scale = Math.min(maxSize / imageData.width, maxSize / imageData.height)
  const thumbWidth = Math.round(imageData.width * scale)
  const thumbHeight = Math.round(imageData.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = thumbWidth
  canvas.height = thumbHeight
  const ctx = canvas.getContext('2d')!

  // Draw scaled image
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = imageData.width
  tempCanvas.height = imageData.height
  const tempCtx = tempCanvas.getContext('2d')!
  tempCtx.putImageData(imageData, 0, 0)

  ctx.drawImage(tempCanvas, 0, 0, thumbWidth, thumbHeight)
  return ctx.getImageData(0, 0, thumbWidth, thumbHeight)
}
