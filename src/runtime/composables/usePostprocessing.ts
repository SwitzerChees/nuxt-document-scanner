import { onUnmounted } from 'vue'
import type {
  DocumentPage,
  DocumentProcessingProfile,
  ProcessingRecipe,
  QualityAssessment,
} from '../types'
import {
  denormalizeQuad,
  normalizeQuad,
  processDocumentPixels,
  type ProcessingOptions,
} from '../utils/processing-core'
import { imageDataToBlob } from '../utils/image-postprocessing'

type ProcessingResult = {
  source?: Blob
  processed: Blob
  thumbnail: Blob
  sourceWidth: number
  sourceHeight: number
  outputWidth: number
  outputHeight: number
  quality: QualityAssessment
  recipe: ProcessingRecipe
}

type ProcessingRequest = {
  imageData: ImageData
  corners: number[]
  profile: DocumentProcessingProfile
  rotation?: 0 | 90 | 180 | 270
  quadConfidence?: number
  retainSource?: boolean
}

type Options = {
  maxOutputPixels: number
  maxOutputLongEdge: number
  jpegQuality: number
  thumbnailLongEdge: number
}

type PendingRequest = {
  generation: number
  requestId: number
  timeout: ReturnType<typeof setTimeout>
  resolve: (result: ProcessingResult) => void
  reject: (error: Error) => void
}

const createObjectUrl = (blob: Blob) => URL.createObjectURL(blob)

export const usePostprocessing = (options: Options) => {
  let worker: Worker | undefined
  let generation = 0
  let requestSequence = 0
  let pending: PendingRequest | undefined

  const terminateWorker = () => {
    if (pending) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Image processing was cancelled.'))
      pending = undefined
    }
    worker?.terminate()
    worker = undefined
    generation++
  }

  const ensureWorker = () => {
    if (worker || !import.meta.client) return worker
    worker = new Worker(
      new URL('../workers/postprocessing.worker.js', import.meta.url),
      { type: 'module' },
    )
    worker.addEventListener('message', (event) => {
      const message = event.data
      if (
        !pending ||
        message.generation !== pending.generation ||
        message.requestId !== pending.requestId
      ) {
        return
      }
      const current = pending
      clearTimeout(current.timeout)
      pending = undefined
      if (message.type === 'error') {
        current.reject(new Error(message.error || 'Image processing failed.'))
      } else if (message.type === 'result') {
        current.resolve(message.payload as ProcessingResult)
      }
    })
    worker.addEventListener('error', (event) => {
      const current = pending
      terminateWorker()
      current?.reject(new Error(event.message || 'Image processing worker failed.'))
    })
    return worker
  }

  const processingOptions = (
    request: ProcessingRequest,
  ): ProcessingOptions => ({
    profile: request.profile,
    rotation: request.rotation,
    maxPixels: options.maxOutputPixels,
    maxLongEdge: options.maxOutputLongEdge,
    quadConfidence: request.quadConfidence,
  })

  const processOnMainThread = async (
    request: ProcessingRequest,
  ): Promise<ProcessingResult> => {
    const result = processDocumentPixels(
      request.imageData,
      request.corners,
      processingOptions(request),
    )
    if (!result) throw new Error('The document perspective could not be resolved.')
    const [source, processed, thumbnail] = await Promise.all([
      request.retainSource === false
        ? Promise.resolve(undefined)
        : imageDataToBlob(request.imageData, 'image/jpeg', Math.max(0.9, options.jpegQuality)),
      imageDataToBlob(result.imageData, 'image/jpeg', options.jpegQuality),
      imageDataToBlob(
        result.imageData,
        'image/jpeg',
        0.76,
        options.thumbnailLongEdge,
      ),
    ])
    return {
      source,
      processed,
      thumbnail,
      sourceWidth: request.imageData.width,
      sourceHeight: request.imageData.height,
      outputWidth: result.imageData.width,
      outputHeight: result.imageData.height,
      quality: result.quality,
      recipe: result.recipe,
    }
  }

  const process = async (request: ProcessingRequest) => {
    if (pending) throw new Error('Another page is still being processed.')
    const activeWorker = ensureWorker()
    let result: ProcessingResult
    if (!activeWorker) {
      result = await processOnMainThread(request)
    } else {
      const requestId = ++requestSequence
      const currentGeneration = generation
      result = await new Promise<ProcessingResult>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (pending?.requestId !== requestId) return
          pending = undefined
          activeWorker.terminate()
          worker = undefined
          generation++
          reject(new Error('Image processing timed out.'))
        }, 20_000)
        pending = {
          generation: currentGeneration,
          requestId,
          timeout,
          resolve,
          reject,
        }
        try {
          activeWorker.postMessage(
            {
              type: 'process',
              generation: currentGeneration,
              requestId,
              payload: {
                imageData: request.imageData,
                corners: request.corners,
                options: processingOptions(request),
                jpegQuality: options.jpegQuality,
                thumbnailLongEdge: options.thumbnailLongEdge,
                retainSource: request.retainSource !== false,
              },
            },
            [request.imageData.data.buffer],
          )
        } catch (error) {
          clearTimeout(timeout)
          pending = undefined
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      })
    }
    const normalizedQuad = normalizeQuad(
      request.corners,
      result.sourceWidth,
      result.sourceHeight,
    )
    return createPage(result, normalizedQuad, request.profile, request.rotation || 0)
  }

  const createPage = (
    result: ProcessingResult,
    quad: number[],
    profile: DocumentProcessingProfile,
    rotation: 0 | 90 | 180 | 270,
    id = `page-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  ): DocumentPage => {
    const sourceUrl = result.source ? createObjectUrl(result.source) : undefined
    return {
      id,
      type: 'image',
      format: 'jpg',
      source: result.source,
      processed: result.processed,
      thumbnail: result.thumbnail,
      sourceUrl,
      previewUrl: createObjectUrl(result.processed),
      thumbnailUrl: createObjectUrl(result.thumbnail),
      sourceWidth: result.sourceWidth,
      sourceHeight: result.sourceHeight,
      outputWidth: result.outputWidth,
      outputHeight: result.outputHeight,
      quad,
      rotation,
      profile,
      processingRecipe: result.recipe,
      quality: result.quality,
      needsReview: !result.quality.acceptableForAutoCapture,
      timestamp: Date.now(),
    }
  }

  const revokePageUrls = (page: DocumentPage) => {
    for (const url of [page.sourceUrl, page.previewUrl, page.thumbnailUrl]) {
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
    }
  }

  const replacePage = async (
    page: DocumentPage,
    changes: {
      profile?: DocumentProcessingProfile
      rotation?: 0 | 90 | 180 | 270
      quad?: number[]
    },
  ) => {
    if (!page.source) throw new Error('The original page is no longer available.')
    const bitmap = await createImageBitmap(page.source)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Could not decode the source page.')
      context.drawImage(bitmap, 0, 0)
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
      const quad = changes.quad || page.quad
      const result = await process({
        imageData,
        corners: denormalizeQuad(quad, canvas.width, canvas.height),
        profile: changes.profile || page.profile,
        rotation: changes.rotation ?? page.rotation,
      })
      result.id = page.id
      return result
    } finally {
      bitmap.close()
    }
  }

  onUnmounted(terminateWorker)

  return {
    process,
    replacePage,
    revokePageUrls,
    dispose: terminateWorker,
  }
}
