import { ref } from 'vue'
import type { AutoCaptureOptions } from '../types'

export const useAutoCapture = (opts: AutoCaptureOptions) => {
  const { enabled, delay, cooldown } = opts

  const startTime = ref(0)
  const isCoolingDown = ref(false)
  const progress = ref(0)

  const updateProgress = (isStable: boolean) => {
    // Reset if not enabled, cooling down, or not stable
    if (!enabled || isCoolingDown.value || !isStable) {
      progress.value = 0
      if (!isStable) {
        startTime.value = 0
      }
      return
    }

    // Start timer if stable and not started
    if (isStable && startTime.value === 0) {
      startTime.value = performance.now()
    }

    // Calculate progress
    if (startTime.value > 0) {
      const elapsed = performance.now() - startTime.value
      progress.value = Math.min(elapsed / delay, 1)
    }
  }

  const canAutoCapture = () => {
    if (!enabled || isCoolingDown.value || startTime.value === 0) return false
    const elapsed = performance.now() - startTime.value
    return elapsed >= delay
  }

  const reset = (withCooldown = false) => {
    startTime.value = 0
    progress.value = 0
    if (!withCooldown) return
    isCoolingDown.value = true
    setTimeout(() => (isCoolingDown.value = false), cooldown)
  }

  return { updateProgress, canAutoCapture, reset, progress, delay }
}
