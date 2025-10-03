<template>
  <div class="scanner-top">
    <div class="status-pill" aria-label="Camera active">
      <span class="dot" />
    </div>
    <div class="mode-switch" role="tablist" aria-label="Scan mode">
      <button
        class="mode"
        :class="{ 'is-active': mode === 'camera' }"
        role="tab"
        aria-selected="true"
        @click="$emit('mode-switch', 'camera')"
      >
        CAMERA
      </button>
      <button
        class="mode"
        :class="{ 'is-active': mode === 'edges' }"
        role="tab"
        aria-selected="false"
        @click="$emit('mode-switch', 'edges')"
      >
        EDGES
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const { mode } = defineProps<{
  mode: 'camera' | 'edges' | 'preview'
}>()

defineEmits<{
  (e: 'mode-switch', newMode: 'camera' | 'edges' | 'preview'): void
}>()
</script>

<style scoped>
.scanner-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding-top: 24px;
  pointer-events: none;
}

.status-pill {
  height: 36px;
  padding: 0 20px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25) inset,
    0 4px 16px rgba(0, 0, 0, 0.25);
}

.status-pill .dot {
  width: 8px;
  height: 8px;
  background: #22c55e;
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.9);
}

.mode-switch {
  display: inline-flex;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  overflow: hidden;
  backdrop-filter: blur(6px);
  pointer-events: auto;
}

.mode {
  appearance: none;
  background: transparent;
  color: #e5e7eb;
  border: 0;
  padding: 8px 14px;
  font-size: 12px;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.mode:hover {
  background: rgba(255, 255, 255, 0.08);
}
.mode.is-active {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}
</style>
