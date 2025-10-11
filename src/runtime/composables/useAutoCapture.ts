import { computed, ref } from 'vue'
import type { AutoCaptureOptions } from '../types'

export const useAutoCapture = (opts: AutoCaptureOptions) => {
  const { enabled, delay, cooldown } = opts

  const autoCaptureStartTime = ref(0)

  const progress = computed(() => {
    if (autoCaptureStartTime.value === 0) return 0
    return Math.min((performance.now() - autoCaptureStartTime.value) / delay, 1)
  })

  const canAutoCapture = (isStable: boolean) => {
    // check if isStable and isAutoCapture then start autoCapture
    if (enabled && isStable && autoCaptureStartTime.value === 0) {
      autoCaptureStartTime.value = performance.now()
    } else if (!isStable) {
      autoCaptureStartTime.value = 0
    }

    // check if autoCaptureStartTime is set and autoCaptureDelay has passed
    const elapsed = performance.now() - autoCaptureStartTime.value
    if (autoCaptureStartTime.value && elapsed >= delay) {
      return true
    }
    return false
  }

  const cancelAutoCapture = (withCooldown = false) => {
    if (withCooldown) {
      autoCaptureStartTime.value = performance.now() + cooldown
      return
    }
    autoCaptureStartTime.value = 0
  }

  return { canAutoCapture, cancelAutoCapture, progress }
}
