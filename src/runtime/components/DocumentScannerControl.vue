<template>
  <div class="document-scanner-control-container">
    <div class="document-scanner-control-buttons">
      <button class="document-scanner-control-button">
        <Icon name="mdi:close" />
      </button>
      <button class="document-scanner-control-button">
        <Icon name="mdi:camera" />
      </button>
      <button class="document-scanner-control-button">
        <Icon name="mdi:camera" />
      </button>
      <button class="document-scanner-control-button">
        <Icon name="mdi:camera" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// this component has a close button, a capture button and a open current camera shots button as bottom navigation
</script>

<style scoped>
.document-scanner-control-container {
  position: absolute;
}
.document-scanner-control-button {
  position: absolute;
  bottom: 20px;
  right: 20px;
}
</style>
