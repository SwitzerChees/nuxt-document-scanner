import { onUnmounted } from 'vue'
import type { DocumentPage, DocumentProcessingProfile, ProcessingRecipe, QualityAssessment } from '../types'
import { WorkerRPC } from '../core/rpc'
import { normalizeQuad } from '../utils/processing-core'

type ProcessingResult = {
  source?: Blob;
  processed: Blob;
  preview: Blob;
  thumbnail: Blob;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  corners: number[];
  quality: QualityAssessment;
  recipe: ProcessingRecipe;
  blurry: boolean;
}
type ProcessingRequest = {
  frames?: ImageBitmap[];
  source?: Blob;
  corners?: number[];
  normalizedQuad?: number[];
  profile: DocumentProcessingProfile;
  rotation?: 0 | 90 | 180 | 270;
  quadConfidence?: number;
  retainSource?: boolean;
  refine?: boolean;
}
type Options = {
  maxOutputPixels: number;
  maxOutputLongEdge: number;
  jpegQuality: number;
  thumbnailLongEdge: number;
}
export const usePostprocessing = (options: Options) => {
  let worker: WorkerRPC | undefined
  const dispose = () => {
    worker?.close()
    worker = undefined
  }
  const process = async (request: ProcessingRequest): Promise<DocumentPage> => {
    const rpc = worker ||= new WorkerRPC(new Worker(new URL('../workers/postprocessing.worker.js', import.meta.url), { type: 'module' }))
    let result: ProcessingResult
    try {
      result = await rpc.request<ProcessingResult>('process', {
        ...request, ...options,
        // Page coordinates come from Vue refs; worker messages cannot contain reactive proxies.
        corners: request.corners?.slice(),
        normalizedQuad: request.normalizedQuad?.slice(),
        options: { profile: request.profile, rotation: request.rotation, quadConfidence: request.quadConfidence,
          refine: request.refine, maxPixels: options.maxOutputPixels, maxLongEdge: options.maxOutputLongEdge },
      }, request.frames ?? [], 20000)
    }
    catch (error) {
      if (worker === rpc)
        dispose()
      throw error
    }
    return {
      id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'image', format: 'jpg', source: result.source, processed: result.processed, preview: result.preview,
      thumbnail: result.thumbnail, sourceUrl: result.source ? URL.createObjectURL(result.source) : undefined,
      previewUrl: URL.createObjectURL(result.preview), thumbnailUrl: URL.createObjectURL(result.thumbnail),
      sourceWidth: result.sourceWidth, sourceHeight: result.sourceHeight,
      outputWidth: result.outputWidth, outputHeight: result.outputHeight,
      quad: normalizeQuad(result.corners, result.sourceWidth, result.sourceHeight),
      profile: request.profile, rotation: request.rotation ?? 0, quality: result.quality, processingRecipe: result.recipe,
      blurry: result.blurry, needsReview: !result.quality.acceptableForAutoCapture, timestamp: Date.now(),
    }
  }
  const revokePageUrls = (page: DocumentPage) => {
    for (const url of [page.sourceUrl, page.previewUrl, page.thumbnailUrl]) {
      if (url?.startsWith('blob:'))
        URL.revokeObjectURL(url)
    }
  }
  const replacePage = async (page: DocumentPage, changes: {
    profile?: DocumentProcessingProfile;
    rotation?: 0 | 90 | 180 | 270;
    quad?: number[];
  }) => {
    if (!page.source)
      throw new Error('The original page is no longer available.')
    const result = await process({ source: page.source, normalizedQuad: changes.quad ?? page.quad,
      profile: changes.profile ?? page.profile, rotation: changes.rotation ?? page.rotation,
      quadConfidence: page.quality.quadConfidence, refine: false })
    result.id = page.id
    return result
  }
  onUnmounted(dispose)
  return { process, replacePage, revokePageUrls, dispose }
}
