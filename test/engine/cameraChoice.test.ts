import { describe, expect, test } from 'vitest'
import { friendlyCameraNames, pickDocumentCamera } from '../../src/runtime/engine/cameraChoice'

describe('document camera choice', () => {
  test('prefers the iPhone camera that switches to macro on its own', () => {
    const cameras = [
      { deviceId: 'front', label: 'Front Camera' },
      { deviceId: 'wide', label: 'Back Camera' },
      { deviceId: 'ultra', label: 'Back Ultra Wide Camera' },
      { deviceId: 'tele', label: 'Back Telephoto Camera' },
      { deviceId: 'dualwide', label: 'Back Dual Wide Camera' },
      { deviceId: 'triple', label: 'Back Triple Camera' },
    ]

    expect(pickDocumentCamera(cameras)).toBe('triple')

    expect(pickDocumentCamera(cameras.filter((c) => c.deviceId !== 'triple'))).toBe('dualwide')

    expect(pickDocumentCamera(cameras.filter((c) => !['triple', 'dualwide'].includes(c.deviceId)))).toBe('wide')
  })

  test('picks the Android main camera over ultra-wide and fixed-focus sensors', () => {
    const cameras = [
      { deviceId: 'c2', label: 'camera2 2, facing back', capabilities: { facingMode: ['environment'], focusMode: ['fixed'], width: { max: 1920 } } },
      { deviceId: 'c1', label: 'camera2 1, facing front', capabilities: { facingMode: ['user'], focusMode: ['continuous'] } },
      { deviceId: 'c0', label: 'camera2 0, facing back', capabilities: { facingMode: ['environment'], focusMode: ['continuous', 'manual'], torch: true, width: { max: 4000 } } },
      { deviceId: 'c3', label: 'camera2 3, facing back', capabilities: { facingMode: ['environment'], focusMode: ['continuous'], width: { max: 3264 } } },
    ]

    expect(pickDocumentCamera(cameras)).toBe('c0')
  })

  test('falls back to label order when the browser shares no capabilities', () => {
    const cameras = [
      { deviceId: 'b', label: 'camera 2, facing back' },
      { deviceId: 'a', label: 'camera 0, facing back' },
    ]

    expect(pickDocumentCamera(cameras)).toBe('a')
  })

  test('leaves the choice to the browser when labels are hidden', () => {
    expect(pickDocumentCamera([{ deviceId: 'x', label: '' }, { deviceId: 'y', label: '' }])).toBeUndefined()
  })
})
describe('camera names', () => {
  const words = { camera: 'Camera', backCamera: 'Back camera', frontCamera: 'Front camera' }

  test('Android labels become back/front camera names, numbered only when there are several', () => {
    expect(friendlyCameraNames(['camera2 1, facing front', 'camera2 0, facing back', 'camera2 2, facing back'], words)).toEqual([
      'Front camera',
      'Back camera 1',
      'Back camera 2',
    ])
  })

  test('descriptive labels stay and missing ones are numbered', () => {
    expect(friendlyCameraNames(['Back Triple Camera', ''], words)).toEqual(['Back Triple Camera', 'Camera 2'])
  })
})
