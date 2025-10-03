<template>
  <div class="preview">
    <header class="preview-top">
      <button class="back" aria-label="Back" @click="$emit('back')">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            fill="currentColor"
            d="M15.5 4.5a1 1 0 0 1 0 1.4L10.4 11l5.1 5.1a1 1 0 1 1-1.4 1.4l-5.8-5.8a1.5 1.5 0 0 1 0-2.12l5.8-5.8a1 1 0 0 1 1.4 0Z"
          />
        </svg>
        <span>Back</span>
      </button>

      <div class="title-group">
        <h2>Preview</h2>
        <div class="name-field">
          <label>Document name</label>
          <input :value="defaultName" placeholder="Untitled" readonly />
        </div>
      </div>

      <button class="primary" aria-label="Save">
        <span>Save</span>
      </button>
    </header>

    <main class="grid">
      <div v-for="(src, index) in images" :key="index" class="card">
        <div class="frame">
          <img :src="src" :alt="`Preview ${index + 1}`" />
        </div>
        <div class="card-footer">
          <span class="page">Page {{ index + 1 }}</span>
          <div class="actions">
            <button class="small" aria-label="Reorder">
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                aria-hidden="true"
              >
                <path fill="currentColor" d="M3 7h18v2H3V7Zm0 8h18v2H3v-2Z" />
              </svg>
            </button>
            <button class="small ghost" aria-label="Delete">
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M9 3h6a1 1 0 0 1 1 1v2h4v2H4V6h4V4a1 1 0 0 1 1-1Zm1 3h4V5h-4v1Zm-3 5h2v7H7v-7Zm4 0h2v7h-2v-7Zm4 0h2v7h-2v-7Z"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
defineProps<{ images?: string[]; defaultName?: string }>()
defineEmits<{ (e: 'back'): void }>()
</script>

<style scoped>
.preview {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, #0b0f14, #0b0f14 20%, #0e141b 100%);
  color: #e5e7eb;
  display: flex;
  flex-direction: column;
}

.preview-top {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 14px 16px;
  gap: 12px;
  background: rgba(0, 0, 0, 0.45);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(6px);
}

.back {
  justify-self: start;
}
.primary {
  justify-self: end;
}

.title-group {
  text-align: center;
}
.title-group h2 {
  margin: 0;
  font-weight: 600;
  font-size: 16px;
}

.name-field {
  margin-top: 6px;
  display: inline-grid;
  gap: 6px;
}
.name-field label {
  font-size: 11px;
  color: #9ca3af;
}
.name-field input {
  background: rgba(255, 255, 255, 0.06);
  color: #e5e7eb;
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
}

.grid {
  padding: 18px 16px calc(env(safe-area-inset-bottom, 0) + 24px);
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  overflow-y: auto;
}

.card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

.frame {
  aspect-ratio: 3 / 2;
  background: #0f172a;
  display: grid;
  place-items: center;
}
.frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 10px 12px;
}

.page {
  font-size: 12px;
  color: #9ca3af;
}

.actions {
  display: inline-flex;
  gap: 8px;
}

.back,
.primary,
.small,
.ghost {
  appearance: none;
  background: rgba(255, 255, 255, 0.08);
  color: #e5e7eb;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  padding: 8px 10px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: transform 0.12s ease, background 0.2s ease;
}

.primary {
  background: linear-gradient(180deg, #10b981, #059669);
  border-color: transparent;
  color: #04160f;
  font-weight: 600;
}
.ghost {
  background: rgba(255, 255, 255, 0.06);
}
.small {
  padding: 6px 8px;
  border-radius: 8px;
}

.back:hover,
.primary:hover,
.small:hover {
  transform: translateY(-1px);
}
.back:active,
.primary:active,
.small:active {
  transform: translateY(0);
}
</style>
