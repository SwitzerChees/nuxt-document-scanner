import { computed, ref } from 'vue'
import type { AutoCaptureOptions } from '../types'

export const useAutoCapture = (opts: AutoCaptureOptions) => {
  const { enabled, delay, cooldown } = opts

  const startTime = ref(0)
  const isCoolingDown = ref(false)

  const progress = computed(() => {
    if (!enabled || isCoolingDown.value || startTime.value === 0) return 0
    const elapsed = performance.now() - startTime.value
    console.log('progress', Math.min(elapsed / delay, 1))
    return Math.min(elapsed / delay, 1)
  })

  const canAutoCapture = (isStable: boolean) => {
    if (!enabled || isCoolingDown.value) return false

    if (isStable && startTime.value === 0) startTime.value = performance.now()

    if (!isStable) {
      startTime.value = 0
      return false
    }

    const elapsed = performance.now() - startTime.value
    return elapsed >= delay
  }

  const cancelAutoCapture = (withCooldown = false) => {
    startTime.value = 0
    if (!withCooldown) return
    isCoolingDown.value = true
    setTimeout(() => (isCoolingDown.value = false), cooldown)
  }

  return { canAutoCapture, cancelAutoCapture, progress }
}
