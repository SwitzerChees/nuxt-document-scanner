<template>
  <DocumentScanner />
</template>

<script setup>
useHead({
  meta: [
    {
      name: 'viewport',
      content:
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover',
    },
  ],
})
</script>

<style>
html,
body {
  margin: 0;
  padding: 0;
  overflow: hidden;
  width: 100%;
  height: 100%;
  position: fixed;
}
</style>
