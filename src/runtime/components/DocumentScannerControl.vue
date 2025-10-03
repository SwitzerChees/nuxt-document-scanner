<template>
  <div class="controls">
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
        <svg
          v-if="(autoCaptureProgress || 0) > 0"
          class="countdown-ring"
          viewBox="0 0 80 80"
        >
          <circle
            cx="40"
            cy="40"
            r="36"
            fill="none"
            stroke="#22c55e"
            stroke-width="4"
            :stroke-dasharray="circumference"
            :stroke-dashoffset="
              circumference * (1 - (autoCaptureProgress || 0))
            "
            transform="rotate(-90 40 40)"
          />
        </svg>
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
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21 19V7a2 2 0 0 0-2-2h-3.2l-.6-1.2A2 2 0 0 0 13.4 2h-2.8a2 2 0 0 0-1.8 1.2L8.2 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2Zm-7-8a3 3 0 1 1-6 0a3 3 0 0 1 6 0Zm-10 8l4.6-6.13a1 1 0 0 1 1.6 0L14 19H4Z"
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
  autoCaptureProgress?: number
}>()

defineEmits<{
  (e: 'close' | 'capture' | 'open-preview'): void
}>()

// Calculate circle circumference for countdown animation
const circumference = computed(() => 2 * Math.PI * 36)
</script>

<style scoped>
.controls {
  position: relative;
  padding: 22px 20px calc(env(safe-area-inset-bottom, 0) + 22px);
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

.countdown-ring {
  position: absolute;
  width: 80px;
  height: 80px;
  pointer-events: none;
}

.countdown-ring circle {
  transition: stroke-dashoffset 0.05s linear;
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
  width: 52px;
  height: 52px;
  border-radius: 10px;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.thumb-frame img,
.thumb-empty {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  background: #111827;
  color: #9ca3af;
}

.thumbnail:hover .thumb-frame {
  filter: brightness(1.1);
}
.thumbnail:active .thumb-frame {
  filter: brightness(0.98);
}
</style>
