import { describe, expect, it } from 'vitest'
import { selectCaptureCorners } from '../src/runtime/utils/capture-corners'

describe('capture corner selection', () => {
  it('uses scaled live corners for HD captures to keep the preview orientation stable', () => {
    const liveCorners = [10, 20, 90, 20, 90, 180, 10, 180]
    const detectedCorners = [0, 0, 120, 0, 120, 80, 0, 80]

    expect(
      selectCaptureCorners({
        detectedCorners,
        liveCorners,
        liveFrameSize: { width: 100, height: 200 },
        finalFrameSize: { width: 200, height: 400 },
        isHighResolution: true,
      }),
    ).toEqual([20, 40, 180, 40, 180, 360, 20, 360])
  })

  it('keeps the freshly detected corners for normal captures', () => {
    const liveCorners = [10, 20, 90, 20, 90, 180, 10, 180]
    const detectedCorners = [12, 22, 88, 22, 88, 178, 12, 178]

    expect(
      selectCaptureCorners({
        detectedCorners,
        liveCorners,
        finalFrameSize: { width: 100, height: 200 },
      }),
    ).toEqual(detectedCorners)
  })
})
