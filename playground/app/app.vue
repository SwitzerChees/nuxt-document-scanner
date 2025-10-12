<template>
  <div class="app">
    <!-- <button class="button" @click="toggleScanner">Show Scanner</button> -->
    <DocumentScanner
      v-if="showScanner"
      @close="toggleScanner"
      @save="handleSave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

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

const toggleScanner = () => {
  showScanner.value = !showScanner.value
}

const handleSave = (documents: any[]) => {
  toggleScanner()
  console.log('Documents saved:', documents)
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
