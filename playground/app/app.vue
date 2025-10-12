<template>
  <div class="app">
    <button class="button" @click="showScanner = true">Show Scanner</button>
    <DocumentScanner
      ref="scannerRef"
      v-if="showScanner"
      @close="showScanner = false"
      @save="handleSave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Document } from '../../src/runtime/types'
import type DocumentScanner from '../../src/runtime/components/DocumentScanner.vue'

useHead({
  meta: [
    {
      name: 'viewport',
      content:
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover',
    },
  ],
})

const showScanner = ref(true)
const scannerRef = ref<InstanceType<typeof DocumentScanner>>()

const handleSave = (document: Document) => {
  console.log('Documents saved:', document)
  scannerRef.value?.stopScanner()
  showScanner.value = false
}
</script>

<style>
.app {
  width: 100vw;
  height: 100vh;
}

.button {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1000;
  background: #000;
  color: #fff;
  padding: 10px 20px;
  border-radius: 5px;
  cursor: pointer;
}
</style>
