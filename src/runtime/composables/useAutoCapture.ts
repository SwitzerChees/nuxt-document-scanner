import { getCurrentInstance, onUnmounted, ref } from 'vue'
import type { AutoCaptureOptions } from '../types'

export const useAutoCapture = (opts: AutoCaptureOptions) => {
  const { enabled, delay, cooldown } = opts

  const startTime = ref(0)
  const isCoolingDown = ref(false)
  const requiresFreshTarget = ref(false)
  const progress = ref(0)
  let cooldownTimer: ReturnType<typeof setTimeout> | undefined
  let freshTargetMissingSince = 0
  const freshTargetMissingDuration = 700

  const clearCooldown = () => {
    if (cooldownTimer) clearTimeout(cooldownTimer)
    cooldownTimer = undefined
    isCoolingDown.value = false
  }

  const startCooldown = (duration = cooldown) => {
    startTime.value = 0
    progress.value = 0
    clearCooldown()
    if (duration <= 0) return
    isCoolingDown.value = true
    cooldownTimer = setTimeout(() => {
      cooldownTimer = undefined
      isCoolingDown.value = false
    }, duration)
  }

  const requireFreshTarget = (withCooldown = true) => {
    startTime.value = 0
    progress.value = 0
    freshTargetMissingSince = 0
    requiresFreshTarget.value = true
    if (withCooldown) startCooldown()
  }

  const updateFreshTargetGate = (isStable: boolean) => {
    if (!requiresFreshTarget.value) return

    if (isStable) {
      freshTargetMissingSince = 0
      return
    }

    const now = performance.now()
    freshTargetMissingSince ||= now
    if (now - freshTargetMissingSince >= freshTargetMissingDuration) {
      requiresFreshTarget.value = false
      freshTargetMissingSince = 0
    }
  }

  const updateProgress = (isStable: boolean) => {
    updateFreshTargetGate(isStable)

    // Reset if not enabled, cooling down, waiting for a new target, or not stable
    if (
      !enabled ||
      isCoolingDown.value ||
      requiresFreshTarget.value ||
      !isStable
    ) {
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
    if (
      !enabled ||
      isCoolingDown.value ||
      requiresFreshTarget.value ||
      startTime.value === 0
    ) {
      return false
    }
    const elapsed = performance.now() - startTime.value
    return elapsed >= delay
  }

  const reset = (withCooldown = false) => {
    startTime.value = 0
    progress.value = 0
    if (withCooldown) startCooldown()
    else clearCooldown()
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      clearCooldown()
    })
  }

  return {
    updateProgress,
    canAutoCapture,
    reset,
    requireFreshTarget,
    startCooldown,
    progress,
    delay,
    isCoolingDown,
    requiresFreshTarget,
  }
}
