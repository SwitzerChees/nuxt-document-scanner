<template>
  <canvas
    ref="overlay"
    class="absolute inset-0 w-full h-full pointer-events-none"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'

const overlay = ref<HTMLCanvasElement>()
</script>
