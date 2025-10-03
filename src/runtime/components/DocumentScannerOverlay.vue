<template>
  <canvas ref="overlay" class="document-scanner-overlay" />
</template>

<script setup lang="ts">
import { ref } from 'vue'

const overlay = ref<HTMLCanvasElement>()
</script>

<style scoped>
.document-scanner-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  width: 100%;
  height: 100%;
}
</style>
