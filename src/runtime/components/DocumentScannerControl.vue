<template>
  <div class="controls">
    <!-- Countdown overlay positioned in viewport center -->
    <div
      v-if="(captureProgress || 0) > 0 && (captureProgress || 0) < 1"
      class="countdown-overlay"
    >
      <div class="countdown-backdrop" />
      <div class="countdown-content">
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
        <div class="countdown-text">
          {{ Math.ceil((1 - (captureProgress || 0)) * 3) }}
        </div>
      </div>
    </div>

    <div class="controls-row">
      <button
        class="icon-button ghost"
        aria-label="Close"
        @click="$emit('close')"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M18.3 5.7a1 1 0 0 0-1.4-1.4L12 9.17 7.1 4.3a1 1 0 0 0-1.42 1.4L10.83 12l-5.15 5.1a1 1 0 1 0 1.42 1.42L12 14.83l4.9 4.89a1 1 0 0 0 1.4-1.41L13.17 12l5.12-5.1Z"
          />
        </svg>
      </button>

      <button
        class="shutter"
        :class="{ stable: isStable, disabled: !canCapture }"
        :disabled="!canCapture"
        aria-label="Capture photo"
        @click="$emit('capture')"
      >
        <span class="ring" />
        <span class="dot" :class="{ stable: isStable }" />
      </button>

      <button
        class="thumbnail"
        aria-label="Open preview"
        @click="$emit('open-preview')"
      >
        <div class="thumb-frame">
          <img v-if="thumbnail" :src="thumbnail" alt="Last capture" />
          <div v-else class="thumb-empty">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              viewBox="0 0 24 24"
            >
              <path
                fill="currentColor"
                d="m13.55 12.475l3.2-2.15q.45-.3.45-.825t-.45-.825l-3.2-2.15q-.5-.35-1.025-.05t-.525.9v4.25q0 .6.525.9t1.025-.05m-7.85 9.4q-.825.125-1.487-.387T3.45 20.15L2.125 9.225q-.1-.825.4-1.475T3.85 7L5 6.85V15q0 1.65 1.175 2.825T9 19h9.3q-.15.6-.6 1.038t-1.1.512zM9 17q-.825 0-1.412-.587T7 15V4q0-.825.588-1.412T9 2h11q.825 0 1.413.588T22 4v11q0 .825-.587 1.413T20 17z"
              />
            </svg>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

defineProps<{
  thumbnail?: string | null
  canCapture?: boolean
  isStable?: boolean
  captureProgress?: number
}>()

defineEmits<{
  (e: 'close' | 'capture' | 'open-preview'): void
}>()

// Calculate circle circumference for countdown animation
const circumference = computed(() => 2 * Math.PI * 54)
</script>

<style scoped>
.controls {
  position: relative;
  padding: 22px 20px calc(env(safe-area-inset-bottom, 0px) + 22px);
  padding-left: max(20px, env(safe-area-inset-left, 0px));
  padding-right: max(20px, env(safe-area-inset-right, 0px));
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.65),
    rgba(0, 0, 0, 0.2) 50%,
    transparent
  );
}

.controls-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: end;
  gap: 20px;
}

.icon-button {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #e5e7eb;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.12s ease, background 0.2s ease, color 0.2s ease;
  backdrop-filter: blur(6px);
}

.icon-button:hover {
  background: rgba(255, 255, 255, 0.12);
  transform: translateY(-1px);
}
.icon-button:active {
  transform: translateY(0);
}
.icon-button.ghost {
  background: rgba(255, 255, 255, 0.04);
}

.shutter {
  position: relative;
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 35%, #1f2937, #0b0f14);
  border: 2px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5),
    inset 0 6px 18px rgba(255, 255, 255, 0.06);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: transform 0.08s ease, box-shadow 0.3s ease;
}

.shutter:hover:not(.disabled) {
  transform: translateY(-1px);
}
.shutter:active:not(.disabled) {
  transform: translateY(0);
}

.shutter.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.shutter.stable {
  box-shadow: 0 10px 30px rgba(34, 197, 94, 0.4),
    inset 0 6px 18px rgba(34, 197, 94, 0.1);
}

.shutter .ring {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.8);
  opacity: 0.9;
  transition: border-color 0.3s ease;
}

.shutter.stable .ring {
  border-color: rgba(34, 197, 94, 0.9);
}

.countdown-overlay {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 9999;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.countdown-backdrop {
  position: absolute;
  inset: -20px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 50%;
  backdrop-filter: blur(8px);
}

.countdown-content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1;
}

.countdown-ring {
  width: 120px;
  height: 120px;
  pointer-events: none;
}

.countdown-ring circle {
  transition: stroke-dashoffset 0.05s linear;
}

.countdown-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 32px;
  font-weight: 700;
  color: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.shutter .dot {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22d3ee;
  box-shadow: 0 0 12px rgba(34, 211, 238, 0.9);
  transition: background 0.3s ease, box-shadow 0.3s ease;
}

.shutter .dot.stable {
  background: #22c55e;
  box-shadow: 0 0 16px rgba(34, 197, 94, 1);
}

.thumbnail {
  justify-self: end;
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
}

.thumb-frame {
  width: 100px;
  height: 100px;
  border-radius: 10px;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.4);
  padding: 8px;
}

.thumb-frame img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain; /* preserve aspect ratio, no distortion */
  display: block;
  overflow: hidden;
  border-radius: 2px;
}

.thumb-empty {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  background: transparent;
  color: #9ca3af;
  border-radius: 4px;
}

.thumbnail:hover .thumb-frame {
  filter: brightness(1.1);
}
.thumbnail:active .thumb-frame {
  filter: brightness(0.98);
}
</style>
