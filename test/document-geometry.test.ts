import { describe, expect, it } from 'vitest'
import {
  calculateQuadMotion,
  validateDocumentQuad,
} from '../src/runtime/utils/document-geometry'

describe('document projection geometry', () => {
  const frameSize = { width: 512, height: 512 }
  const official = [
    48.151894, 223.47687,
    387.1344, 198.09961,
    423.0362, 345.51334,
    40.148613, 361.38782,
  ]

  it('accepts the official perspective example', () => {
    expect(validateDocumentQuad(official, { frameSize })).toMatchObject({
      valid: true,
      reasons: [],
    })
  })

  it('rejects tiny, crossed and out-of-bounds quads', () => {
    expect(
      validateDocumentQuad([10, 10, 20, 10, 20, 20, 10, 20], { frameSize }).valid,
    ).toBe(false)
    expect(
      validateDocumentQuad([40, 40, 460, 460, 460, 40, 40, 460], { frameSize }).valid,
    ).toBe(false)
    expect(
      validateDocumentQuad([-100, 40, 460, 50, 450, 470, 30, 460], { frameSize }).valid,
    ).toBe(false)
  })

  it('supports long receipts without requiring image-space right angles', () => {
    const receipt = [190, 30, 300, 45, 340, 480, 160, 460]
    expect(validateDocumentQuad(receipt, { frameSize }).valid).toBe(true)
  })

  it('detects translation even when polygon area stays constant', () => {
    const translated = official.map((value, index) => value + (index % 2 === 0 ? 20 : 0))
    const motion = calculateQuadMotion(official, translated, frameSize)
    expect(motion.areaChange).toBeCloseTo(0, 8)
    expect(motion.rms).toBeGreaterThan(0.02)
    expect(motion.iou).toBeLessThan(0.9)
  })
})
