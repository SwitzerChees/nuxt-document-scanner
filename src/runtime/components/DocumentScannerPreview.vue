<template>
  <div class="preview">
    <header class="preview-header">
      <button class="icon-button" type="button" aria-label="Back" @click="$emit('back')">
        <IconBack />
      </button>
      <div class="preview-title">
        <span>{{ currentLabel }}</span>
      </div>
      <button
        class="icon-button"
        type="button"
        aria-label="Delete current page"
        :disabled="!images?.length"
        @click="deleteCurrent"
      >
        <IconClose />
      </button>
    </header>

    <main
      ref="carouselRef"
      class="carousel"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    >
      <div v-if="!images?.length" class="empty-preview">
        <IconGallery class="empty-preview-icon" />
      </div>

      <div v-else class="track" :style="trackStyle">
        <div v-for="(src, index) in images" :key="index" class="slide">
          <img :src="src" :alt="`Page ${index + 1}`" />
        </div>
      </div>

      <button
        v-if="(images?.length || 0) > 1"
        class="nav prev"
        type="button"
        aria-label="Previous page"
        @click="prev"
      >
        <IconChevronLeft />
      </button>
      <button
        v-if="(images?.length || 0) > 1"
        class="nav next"
        type="button"
        aria-label="Next page"
        @click="next"
      >
        <IconChevronRight />
      </button>
    </main>

    <div v-if="(images?.length || 0) > 1" ref="dotsRef" class="filmstrip">
      <button
        v-for="(src, index) in images"
        :key="index"
        class="filmstrip-item"
        :class="{ active: index === current }"
        type="button"
        :aria-label="`Go to page ${index + 1}`"
        @click="current = index"
      >
        <img :src="src" alt="" />
      </button>
    </div>

    <footer class="actions">
      <button class="secondary-button" type="button" @click="$emit('back')">
        <IconBack />
        <span>Scan more</span>
      </button>
      <button
        class="primary-button"
        type="button"
        :disabled="!images?.length || isSaving"
        @click="openFileNameDialog"
      >
        <span>{{ isSaving ? 'Creating PDF' : 'Save PDF' }}</span>
        <IconSave />
      </button>
    </footer>

    <div
      v-if="isFileNameDialogOpen"
      class="dialog-backdrop"
      @click.self="closeFileNameDialog"
    >
      <form
        class="file-name-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-name-dialog-title"
        @keydown.esc="closeFileNameDialog"
        @submit.prevent="submitFileName"
      >
        <header class="dialog-header">
          <p class="dialog-eyebrow">Export PDF</p>
          <h2 id="file-name-dialog-title">File name</h2>
        </header>
        <label class="file-name-field">
          <span>Name</span>
          <input
            ref="fileNameInputRef"
            v-model="fileName"
            type="text"
            autocomplete="off"
            inputmode="text"
            enterkeyhint="done"
          />
        </label>
        <p v-if="saveError" class="save-error">
          {{ saveError }}
        </p>
        <footer class="dialog-actions">
          <button
            class="dialog-secondary"
            type="button"
            :disabled="isSaving"
            @click="closeFileNameDialog"
          >
            Cancel
          </button>
          <button
            class="dialog-primary"
            type="submit"
            :disabled="isSaving || !fileName.trim()"
          >
            {{ isSaving ? 'Creating PDF' : 'Create PDF' }}
          </button>
        </footer>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import IconSave from './Icon/Save.vue'
import IconBack from './Icon/Back.vue'
import IconClose from './Icon/Close.vue'
import IconGallery from './Icon/Gallery.vue'
import IconChevronLeft from './Icon/ChevronLeft.vue'
import IconChevronRight from './Icon/ChevronRight.vue'

const props = defineProps<{
  defaultFileName?: string
  images?: string[]
  isSaving?: boolean
  pageCount?: number
  saveError?: string
}>()
const emit = defineEmits<{
  (e: 'back'): void
  (e: 'save', fileName: string): void
  (e: 'delete', index: number): void
}>()

const current = ref(0)
const fileName = ref('')
const fileNameInputRef = ref<HTMLInputElement>()
const isFileNameDialogOpen = ref(false)
const startX = ref(0)
const deltaX = ref(0)
const isDragging = ref(false)
const carouselRef = ref<HTMLElement>()
const viewportWidth = ref(0)
const dotsRef = ref<HTMLElement>()
let restoreBodyOverflow: string | null = null
let restoreBodyTouchAction: string | null = null

const currentLabel = computed(() => {
  const count = props.images?.length || props.pageCount || 0
  if (!count) return 'No pages'
  return `Page ${current.value + 1} / ${count}`
})

const measure = () => {
  viewportWidth.value = carouselRef.value?.clientWidth || window.innerWidth
  const track = carouselRef.value?.querySelector('.track') as HTMLElement | null
  if (!track) return
  Array.from(track.children).forEach((element) => {
    const slide = element as HTMLElement
    slide.style.width = `${viewportWidth.value}px`
    slide.style.flex = '0 0 auto'
  })
}

onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
  restoreBodyOverflow = document.body.style.overflow
  restoreBodyTouchAction = document.body.style.touchAction
  document.body.style.overflow = 'hidden'
  document.body.style.touchAction = 'none'
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
  if (restoreBodyOverflow !== null) document.body.style.overflow = restoreBodyOverflow
  if (restoreBodyTouchAction !== null) {
    document.body.style.touchAction = restoreBodyTouchAction
  }
})

const trackStyle = computed(() => {
  const width = Math.max(1, viewportWidth.value)
  const translate = -(current.value * width) + deltaX.value
  const total = (props.images?.length || 1) * width
  return `width:${total}px;transform:translate3d(${translate}px,0,0);${
    isDragging.value ? 'transition:none;' : ''
  }`
})

const onTouchStart = (event: TouchEvent) => {
  if (!props.images?.length) return
  isDragging.value = true
  startX.value = event.touches[0]?.clientX || 0
  deltaX.value = 0
}

const onTouchMove = (event: TouchEvent) => {
  if (!isDragging.value) return
  event.preventDefault()
  deltaX.value = (event.touches[0]?.clientX || 0) - startX.value
}

const onTouchEnd = () => {
  if (!isDragging.value) return
  const threshold = Math.min(80, viewportWidth.value * 0.15)
  if (deltaX.value > threshold && current.value > 0) current.value--
  else if (
    deltaX.value < -threshold &&
    current.value < (props.images?.length || 1) - 1
  ) {
    current.value++
  }
  deltaX.value = 0
  isDragging.value = false
}

const prev = () => {
  if (current.value > 0) current.value--
}

const next = () => {
  if (current.value < (props.images?.length || 1) - 1) current.value++
}

const deleteCurrent = () => {
  if (!props.images?.length) return
  emit('delete', current.value)
}

const openFileNameDialog = () => {
  if (!props.images?.length) return
  fileName.value = props.defaultFileName || 'scan.pdf'
  isFileNameDialogOpen.value = true
  nextTick(() => {
    fileNameInputRef.value?.focus()
    fileNameInputRef.value?.select()
  })
}

const closeFileNameDialog = () => {
  if (props.isSaving) return
  isFileNameDialogOpen.value = false
}

const submitFileName = () => {
  const name = fileName.value.trim()
  if (!name || props.isSaving) return
  emit('save', name)
}

const clampCurrentToBounds = () => {
  const maxIndex = Math.max(0, (props.images?.length || 1) - 1)
  if (current.value > maxIndex) current.value = maxIndex
  if (current.value < 0) current.value = 0
}

watch(
  () => props.images?.length,
  () => {
    clampCurrentToBounds()
    nextTick(() => measure())
  },
)

watch(current, () => {
  nextTick(() => {
    const container = dotsRef.value
    const active = container?.querySelector('.filmstrip-item.active') as
      | HTMLElement
      | undefined
    active?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  })
})

watch(
  () => props.isSaving,
  (newIsSaving, oldIsSaving) => {
    if (oldIsSaving && !newIsSaving && !props.saveError) {
      isFileNameDialogOpen.value = false
    }
  },
)
</script>

<style scoped>
.preview {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(22, 24, 22, 0.96), rgba(7, 9, 10, 1)),
    #090b0c;
  color: #f7f3ea;
  overscroll-behavior: none;
}

.preview-header {
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  align-items: center;
  gap: 10px;
  padding: calc(env(safe-area-inset-top) + 12px) 14px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(9, 11, 12, 0.82);
  backdrop-filter: blur(18px);
}

.preview-title {
  min-width: 0;
  text-align: center;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.icon-button {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: #f7f3ea;
  cursor: pointer;
}

.icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.carousel {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: stretch;
  justify-content: flex-start;
  overflow: hidden;
  touch-action: pan-y;
}

.track {
  display: flex;
  height: 100%;
  transition: transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: transform;
}

.slide {
  display: grid;
  height: 100%;
  place-items: center;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(180deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    #111412;
  background-size: 28px 28px;
}

.slide img {
  display: block;
  width: auto;
  max-width: calc(100% - 24px);
  height: auto;
  max-height: calc(100% - 24px);
  object-fit: contain;
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.5);
}

.empty-preview {
  display: grid;
  width: 100%;
  place-items: center;
  color: rgba(247, 243, 234, 0.36);
}

.empty-preview-icon {
  width: 56px;
  height: 56px;
}

.nav {
  position: absolute;
  top: 50%;
  display: grid;
  width: 42px;
  height: 54px;
  transform: translateY(-50%);
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(9, 11, 12, 0.72);
  color: #f7f3ea;
  cursor: pointer;
  backdrop-filter: blur(14px);
}

.nav.prev {
  left: 12px;
}

.nav.next {
  right: 12px;
}

.filmstrip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 10px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  -webkit-overflow-scrolling: touch;
}

.filmstrip-item {
  width: 52px;
  height: 68px;
  flex: 0 0 auto;
  overflow: hidden;
  border: 2px solid transparent;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  padding: 0;
  cursor: pointer;
}

.filmstrip-item.active {
  border-color: #77d977;
}

.filmstrip-item img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 12px max(14px, env(safe-area-inset-left))
    calc(12px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-right));
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(9, 11, 12, 0.88);
}

.secondary-button,
.primary-button {
  display: inline-flex;
  min-width: 0;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.02em;
  cursor: pointer;
}

.secondary-button {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.08);
  color: #f7f3ea;
}

.primary-button {
  border: 1px solid rgba(119, 217, 119, 0.42);
  background: #77d977;
  color: #101410;
}

.primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.dialog-backdrop {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: end center;
  background: rgba(4, 5, 6, 0.68);
  padding: 18px;
  backdrop-filter: blur(18px);
}

.file-name-dialog {
  width: min(100%, 420px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: #111416;
  padding: 18px;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.42);
}

.dialog-header {
  margin-bottom: 16px;
}

.dialog-header h2 {
  margin: 0;
  font-size: 24px;
  line-height: 1;
}

.dialog-eyebrow {
  margin: 0 0 6px;
  color: #f6b942;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.file-name-field {
  display: grid;
  gap: 8px;
  color: rgba(247, 243, 234, 0.72);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.file-name-field input {
  width: 100%;
  min-height: 48px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  outline: none;
  background: rgba(255, 255, 255, 0.08);
  padding: 0 13px;
  color: #f7f3ea;
  font: 800 16px/1.2 ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0;
  text-transform: none;
}

.file-name-field input:focus {
  border-color: rgba(119, 217, 119, 0.82);
  box-shadow: 0 0 0 3px rgba(119, 217, 119, 0.14);
}

.save-error {
  margin: 12px 0 0;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(126, 30, 30, 0.72);
  padding: 10px 12px;
  color: #fff5f1;
  font-size: 13px;
  font-weight: 700;
}

.dialog-actions {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 10px;
  margin-top: 16px;
}

.dialog-secondary,
.dialog-primary {
  min-height: 46px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 950;
}

.dialog-secondary {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #f7f3ea;
}

.dialog-primary {
  border: 1px solid rgba(119, 217, 119, 0.6);
  background: #77d977;
  color: #101410;
}

.dialog-secondary:disabled,
.dialog-primary:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}
</style>
