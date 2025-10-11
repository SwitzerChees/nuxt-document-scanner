<template>
  <svg class="countdown-ring" viewBox="0 0 120 120">
    <!-- Background circle for contrast -->
    <circle
      cx="60"
      cy="60"
      r="54"
      fill="none"
      stroke="rgba(255, 255, 255, 0.2)"
      stroke-width="8"
    />
    <!-- Progress circle with glow effect -->
    <circle
      cx="60"
      cy="60"
      r="54"
      fill="none"
      stroke="#00ff88"
      stroke-width="6"
      :stroke-dasharray="circumference"
      :stroke-dashoffset="circumference * (1 - (captureProgress || 0))"
      transform="rotate(-90 60 60)"
      class="progress-ring"
    />
  </svg>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    circumference: number
    captureProgress?: number
  }>(),
  {
    captureProgress: 0,
  },
)
</script>
