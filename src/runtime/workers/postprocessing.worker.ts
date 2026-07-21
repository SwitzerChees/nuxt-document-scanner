/// <reference lib="webworker" />
import {
  processDocumentPixels,
  type ProcessingOptions,
} from '../utils/processing-core'

type ProcessMessage = {
  type: 'process'
  generation: number
  requestId: number
  payload: {
    imageData: ImageData
    corners: number[]
    options: ProcessingOptions
    jpegQuality: number
    thumbnailLongEdge: number
    retainSource: boolean
  }
}

const workerScope = self as unknown as DedicatedWorkerGlobalScope

const imageDataToBlob = async (
  imageData: ImageData,
  quality: number,
  maxLongEdge?: number,
) => {
  const scale = maxLongEdge
    ? Math.min(1, maxLongEdge / Math.max(imageData.width, imageData.height))
    : 1
  const width = Math.max(1, Math.round(imageData.width * scale))
  const height = Math.max(1, Math.round(imageData.height * scale))
  const source = new OffscreenCanvas(imageData.width, imageData.height)
  const sourceContext = source.getContext('2d')
  if (!sourceContext) throw new Error('Processing worker could not create a canvas context.')
  sourceContext.putImageData(imageData, 0, 0)
  if (scale === 1) {
    return source.convertToBlob({ type: 'image/jpeg', quality })
  }
  const target = new OffscreenCanvas(width, height)
  const targetContext = target.getContext('2d')
  if (!targetContext) throw new Error('Processing worker could not create a thumbnail context.')
  targetContext.imageSmoothingEnabled = true
  targetContext.imageSmoothingQuality = 'high'
  targetContext.drawImage(source, 0, 0, width, height)
  return target.convertToBlob({ type: 'image/jpeg', quality })
}

workerScope.addEventListener('message', async (event: MessageEvent<ProcessMessage>) => {
  const message = event.data
  if (message.type !== 'process') return
  const { generation, requestId, payload } = message
  try {
    const result = processDocumentPixels(
      payload.imageData,
      payload.corners,
      payload.options,
    )
    if (!result) throw new Error('The document perspective could not be resolved.')
    const [source, processed, thumbnail] = await Promise.all([
      payload.retainSource
        ? imageDataToBlob(payload.imageData, Math.max(0.9, payload.jpegQuality))
        : Promise.resolve(undefined),
      imageDataToBlob(result.imageData, payload.jpegQuality),
      imageDataToBlob(result.imageData, 0.76, payload.thumbnailLongEdge),
    ])
    workerScope.postMessage({
      type: 'result',
      generation,
      requestId,
      payload: {
        source,
        processed,
        thumbnail,
        sourceWidth: payload.imageData.width,
        sourceHeight: payload.imageData.height,
        outputWidth: result.imageData.width,
        outputHeight: result.imageData.height,
        quality: result.quality,
        recipe: result.recipe,
      },
    })
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      generation,
      requestId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

export {}
