<template>
  <div class="document-scanner-container">
    <DocumentScannerCamera class="document-scanner-camera" />
  </div>
</template>

<style scoped>
.document-scanner-container {
  width: 100%;
  height: 100vh;
}
.document-scanner-camera {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
