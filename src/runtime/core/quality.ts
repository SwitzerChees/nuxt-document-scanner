import type { Quad } from '../types'

export function quality(image: {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}, corners?: Quad) {
  const { width: w, height: h, data } = image
  const xs = corners ? [corners[0], corners[2], corners[4], corners[6]] : [0, w]
  const ys = corners ? [corners[1], corners[3], corners[5], corners[7]] : [0, h]
  const left = Math.min(...xs), top = Math.min(...ys), rw = Math.max(...xs) - left, rh = Math.max(...ys) - top
  const luminance = (x: number, y: number) => {
    const i = (y * w + x) * 4
    return data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114
  }
  let sum = 0, squared = 0, light = 0, n = 0
  for (let y = Math.max(1, Math.floor(top + rh * 0.15)); y < Math.min(h - 1, top + rh * 0.85); y++) {
    for (let x = Math.max(1, Math.floor(left + rw * 0.15)); x < Math.min(w - 1, left + rw * 0.85); x++) {
      const c = luminance(x, y)
      const lap = luminance(x - 1, y) + luminance(x + 1, y) + luminance(x, y - 1) + luminance(x, y + 1) - 4 * c
      sum += lap
      squared += lap * lap
      light += c
      n++
    }
  }
  return { sharpness: n ? Math.max(0, squared / n - (sum / n) ** 2) : 0, brightness: n ? light / n : 0 }
}
