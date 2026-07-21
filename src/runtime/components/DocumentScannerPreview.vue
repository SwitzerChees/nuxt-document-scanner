<template>
  <section class="preview" aria-label="Scanned pages review">
    <header class="preview-header" :inert="hasOpenDialog" :aria-hidden="hasOpenDialog">
      <button class="icon-button" type="button" aria-label="Back to camera" @click="$emit('back')">
        <IconBack />
      </button>
      <div class="preview-title" aria-live="polite">{{ currentLabel }}</div>
      <button
        class="icon-button"
        type="button"
        aria-label="Delete current page"
        :disabled="!pages.length || isProcessing"
        @click="deleteCurrent"
      >
        <IconClose />
      </button>
    </header>

    <div v-if="currentPage?.quality.warnings.length" class="quality-warning" role="status" :inert="hasOpenDialog" :aria-hidden="hasOpenDialog">
      <span>{{ qualityWarningText }}</span>
      <button type="button" :disabled="isProcessing" @click="$emit('retake', current)">
        Retake
      </button>
    </div>

    <div v-if="currentPage" class="review-tools" aria-label="Page adjustments" :inert="hasOpenDialog" :aria-hidden="hasOpenDialog">
      <label>
        <span>Look</span>
        <select
          :value="currentPage.profile"
          :disabled="isProcessing"
          @change="changeProfile"
        >
          <option value="original">Original</option>
          <option value="color">Color</option>
          <option value="document">Document</option>
          <option value="grayscale">Grayscale</option>
          <option value="black-and-white">Black &amp; white</option>
        </select>
      </label>
      <button type="button" :disabled="isProcessing" @click="showOriginal = !showOriginal">
        {{ showOriginal ? 'Processed' : 'Compare' }}
      </button>
      <button type="button" :disabled="isProcessing" @click="$emit('rotate', current)">
        Rotate
      </button>
      <button type="button" :disabled="isProcessing || !currentPage.sourceUrl" @click="isCropping = true">
        Crop
      </button>
    </div>

    <div
      ref="carouselRef"
      class="carousel"
      :inert="hasOpenDialog"
      :aria-hidden="hasOpenDialog"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    >
      <div v-if="!pages.length" class="empty-preview">
        <IconGallery class="empty-preview-icon" />
        <p>No scanned pages yet.</p>
      </div>
      <div v-else class="track" :style="trackStyle">
        <div v-for="(page, index) in pages" :key="page.id" class="slide">
          <img
            v-if="Math.abs(index - current) <= 1"
            :src="showOriginal && index === current && page.sourceUrl ? page.sourceUrl : page.previewUrl"
            :alt="`Page ${index + 1}`"
          />
        </div>
      </div>
      <div v-if="isProcessing" class="review-processing" role="status">
        Updating page…
      </div>
      <button
        v-if="pages.length > 1"
        class="nav prev"
        type="button"
        aria-label="Previous page"
        :disabled="current === 0"
        @click="prev"
      >
        <IconChevronLeft />
      </button>
      <button
        v-if="pages.length > 1"
        class="nav next"
        type="button"
        aria-label="Next page"
        :disabled="current === pages.length - 1"
        @click="next"
      >
        <IconChevronRight />
      </button>
    </div>

    <div v-if="pages.length > 1" ref="dotsRef" class="filmstrip" aria-label="Page order" :inert="hasOpenDialog" :aria-hidden="hasOpenDialog">
      <div
        v-for="(page, index) in pages"
        :key="page.id"
        class="filmstrip-entry"
        draggable="true"
        @dragstart="dragIndex = index"
        @dragover.prevent
        @drop="dropAt(index)"
      >
        <button
          class="filmstrip-item"
          :class="{ active: index === current }"
          type="button"
          :aria-label="`Go to page ${index + 1}`"
          :aria-current="index === current ? 'page' : undefined"
          @click="current = index"
        >
          <img :src="page.thumbnailUrl" alt="" />
        </button>
        <div v-if="index === current" class="reorder-buttons">
          <button
            type="button"
            aria-label="Move page left"
            :disabled="index === 0 || isProcessing"
            @click="$emit('reorder', index, index - 1)"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Move page right"
            :disabled="index === pages.length - 1 || isProcessing"
            @click="$emit('reorder', index, index + 1)"
          >
            ›
          </button>
        </div>
      </div>
    </div>

    <footer class="actions" :inert="hasOpenDialog" :aria-hidden="hasOpenDialog">
      <button class="secondary-button" type="button" :disabled="isProcessing" @click="$emit('back')">
        <IconBack />
        <span>Scan more</span>
      </button>
      <button
        class="primary-button"
        type="button"
        :disabled="!pages.length || isSaving || isProcessing"
        @click="openFileNameDialog"
      >
        <span>{{ isSaving ? 'Creating PDF' : 'Create PDF' }}</span>
        <IconSave />
      </button>
    </footer>

    <div v-if="canUndoDelete" class="undo-toast" role="status" :inert="hasOpenDialog" :aria-hidden="hasOpenDialog">
      <span>Page deleted</span>
      <button type="button" @click="$emit('undo-delete')">Undo</button>
    </div>

    <div v-if="isFileNameDialogOpen" class="dialog-backdrop" @click.self="closeFileNameDialog">
      <form
        ref="fileDialogRef"
        class="file-name-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-name-dialog-title"
        @keydown="trapDialogFocus"
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
        <p v-if="saveError" class="save-error" role="alert">{{ saveError }}</p>
        <footer class="dialog-actions">
          <button class="dialog-secondary" type="button" :disabled="isSaving" @click="closeFileNameDialog">
            Cancel
          </button>
          <button class="dialog-primary" type="submit" :disabled="isSaving || !fileName.trim()">
            {{ isSaving ? 'Creating PDF' : 'Create PDF' }}
          </button>
        </footer>
      </form>
    </div>

    <DocumentScannerCropEditor
      v-if="isCropping && currentPage"
      :page="currentPage"
      @cancel="isCropping = false"
      @save="applyCrop"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DocumentPage, DocumentProcessingProfile } from '../types'
import IconSave from './Icon/Save.vue'
import IconBack from './Icon/Back.vue'
import IconClose from './Icon/Close.vue'
import IconGallery from './Icon/Gallery.vue'
import IconChevronLeft from './Icon/ChevronLeft.vue'
import IconChevronRight from './Icon/ChevronRight.vue'
import DocumentScannerCropEditor from './DocumentScannerCropEditor.vue'

const props = withDefaults(defineProps<{
  defaultFileName?: string
  pages?: DocumentPage[]
  isSaving?: boolean
  isProcessing?: boolean
  canUndoDelete?: boolean
  saveError?: string
}>(), { pages: () => [] })

const emit = defineEmits<{
  'back': []
  'save': [fileName: string]
  'delete': [index: number]
  'undo-delete': []
  'rotate': [index: number]
  'profile': [index: number, profile: DocumentProcessingProfile]
  'crop': [index: number, quad: number[]]
  'retake': [index: number]
  'reorder': [from: number, to: number]
}>()

const current = ref(0)
const fileName = ref('')
const fileNameInputRef = ref<HTMLInputElement>()
const fileDialogRef = ref<HTMLElement>()
const isFileNameDialogOpen = ref(false)
const isCropping = ref(false)
const showOriginal = ref(false)
const startX = ref(0)
const deltaX = ref(0)
const isDragging = ref(false)
const carouselRef = ref<HTMLElement>()
const viewportWidth = ref(0)
const dotsRef = ref<HTMLElement>()
const dragIndex = ref<number>()
let restoreBodyOverflow: string | null = null
let restoreBodyTouchAction: string | null = null

const currentPage = computed(() => props.pages[current.value])
const hasOpenDialog = computed(() => isCropping.value || isFileNameDialogOpen.value)
const currentLabel = computed(() =>
  props.pages.length ? `Page ${current.value + 1} / ${props.pages.length}` : 'No pages',
)
const qualityWarningText = computed(() => {
  const warnings = currentPage.value?.quality.warnings || []
  const labels: Record<string, string> = {
    'move-closer': 'The document was too small in the frame.',
    'hold-still': 'This page may be blurred.',
    'too-dark': 'This page may be too dark.',
    'glare': 'Reflections may hide content.',
    'corners-missing': 'Please verify the crop.',
  }
  return warnings.map((warning) => labels[warning]).filter(Boolean).join(' ')
})

const measure = () => {
  viewportWidth.value = carouselRef.value?.clientWidth || window.innerWidth
  const track = carouselRef.value?.querySelector('.track') as HTMLElement | null
  if (!track) return
  for (const element of Array.from(track.children)) {
    const slide = element as HTMLElement
    slide.style.width = `${viewportWidth.value}px`
    slide.style.flex = '0 0 auto'
  }
}

const trackStyle = computed(() => {
  const width = Math.max(1, viewportWidth.value)
  return {
    width: `${Math.max(1, props.pages.length) * width}px`,
    transform: `translate3d(${-(current.value * width) + deltaX.value}px,0,0)`,
    transition: isDragging.value ? 'none' : undefined,
  }
})

const onTouchStart = (event: TouchEvent) => {
  if (!props.pages.length || props.isProcessing) return
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
  else if (deltaX.value < -threshold && current.value < props.pages.length - 1) current.value++
  deltaX.value = 0
  isDragging.value = false
}
const prev = () => {
  if (current.value > 0) current.value--
}
const next = () => {
  if (current.value < props.pages.length - 1) current.value++
}
const deleteCurrent = () => {
  if (currentPage.value) emit('delete', current.value)
}
const changeProfile = (event: Event) => {
  emit('profile', current.value, (event.target as HTMLSelectElement).value as DocumentProcessingProfile)
}
const applyCrop = (quad: number[]) => {
  isCropping.value = false
  emit('crop', current.value, quad)
}
const dropAt = (index: number) => {
  if (dragIndex.value !== undefined && dragIndex.value !== index) {
    emit('reorder', dragIndex.value, index)
    current.value = index
  }
  dragIndex.value = undefined
}

const openFileNameDialog = () => {
  if (!props.pages.length) return
  fileName.value = props.defaultFileName || 'scan.pdf'
  isFileNameDialogOpen.value = true
  nextTick(() => {
    fileNameInputRef.value?.focus()
    fileNameInputRef.value?.select()
  })
}
const closeFileNameDialog = () => {
  if (!props.isSaving) isFileNameDialogOpen.value = false
}
const submitFileName = () => {
  const name = fileName.value.trim()
  if (name && !props.isSaving) emit('save', name)
}
const trapDialogFocus = (event: KeyboardEvent) => {
  if (event.key !== 'Tab') return
  const elements = Array.from(
    fileDialogRef.value?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])') || [],
  )
  const first = elements[0]
  const last = elements.at(-1)
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
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
  if (restoreBodyTouchAction !== null) document.body.style.touchAction = restoreBodyTouchAction
})

watch(() => props.pages.length, () => {
  current.value = Math.max(0, Math.min(current.value, props.pages.length - 1))
  nextTick(measure)
})
watch(current, () => {
  showOriginal.value = false
  nextTick(() => dotsRef.value?.querySelector('.filmstrip-item.active')?.scrollIntoView({
    behavior: 'smooth', inline: 'center', block: 'nearest',
  }))
})
watch(() => props.isSaving, (value, oldValue) => {
  if (oldValue && !value && !props.saveError) isFileNameDialogOpen.value = false
})
</script>

<style scoped>
.preview { position:absolute; inset:0; display:flex; flex-direction:column; overflow:hidden; background:var(--nds-background,#090b0c); color:var(--nds-text,#f7f3ea); overscroll-behavior:none; }
.preview-header { display:grid; grid-template-columns:44px 1fr 44px; align-items:center; gap:10px; padding:calc(env(safe-area-inset-top) + 10px) 14px 10px; border-bottom:1px solid rgba(255,255,255,.1); background:rgba(9,11,12,.9); }
.preview-title { text-align:center; font-size:13px; font-weight:900; letter-spacing:.06em; text-transform:uppercase; }
.icon-button,.review-tools button,.quality-warning button { min-width:44px; min-height:44px; border:1px solid rgba(255,255,255,.15); border-radius:8px; background:rgba(255,255,255,.08); color:inherit; cursor:pointer; }
button:disabled { cursor:not-allowed; opacity:.42; }
.quality-warning { display:flex; align-items:center; gap:10px; padding:9px 14px; background:rgba(126,75,20,.76); font-size:12px; font-weight:700; }
.quality-warning span { flex:1; }
.quality-warning button { min-height:38px; }
.review-tools { display:flex; gap:8px; overflow-x:auto; padding:8px 12px; border-bottom:1px solid rgba(255,255,255,.1); background:#111416; }
.review-tools label { display:flex; align-items:center; gap:7px; min-height:44px; padding:0 8px; border:1px solid rgba(255,255,255,.14); border-radius:8px; font-size:11px; font-weight:800; text-transform:uppercase; }
.review-tools select { min-height:36px; border:0; background:#202426; color:inherit; font:inherit; }
.review-tools button { padding:0 13px; white-space:nowrap; font-weight:800; }
.carousel { position:relative; display:flex; flex:1; min-height:0; overflow:hidden; touch-action:pan-y; }
.track { display:flex; height:100%; transition:transform 260ms cubic-bezier(.2,.8,.2,1); will-change:transform; }
.slide { display:grid; height:100%; place-items:center; background:linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),#111412; background-size:28px 28px; }
.slide img { display:block; max-width:calc(100% - 28px); max-height:calc(100% - 28px); object-fit:contain; box-shadow:0 24px 50px rgba(0,0,0,.5); }
.empty-preview { display:grid; width:100%; place-content:center; justify-items:center; color:rgba(247,243,234,.5); }
.empty-preview-icon { width:56px; height:56px; }
.review-processing { position:absolute; inset:0; display:grid; place-items:center; background:rgba(8,10,12,.58); font-weight:900; letter-spacing:.05em; }
.nav { position:absolute; top:50%; width:44px; height:56px; transform:translateY(-50%); border:1px solid rgba(255,255,255,.14); border-radius:8px; background:rgba(9,11,12,.75); color:inherit; }
.nav.prev { left:12px; }.nav.next { right:12px; }
.filmstrip { display:flex; gap:8px; min-height:82px; overflow-x:auto; padding:7px 14px; border-top:1px solid rgba(255,255,255,.1); }
.filmstrip-entry { position:relative; flex:0 0 auto; }
.filmstrip-item { width:52px; height:68px; overflow:hidden; padding:0; border:2px solid transparent; border-radius:6px; background:rgba(255,255,255,.08); }
.filmstrip-item.active { border-color:var(--nds-accent,#77d977); }.filmstrip-item img { width:100%; height:100%; object-fit:cover; }
.reorder-buttons { position:absolute; right:-3px; bottom:-2px; left:-3px; display:flex; justify-content:space-between; }
.reorder-buttons button { width:24px; height:24px; border:1px solid rgba(255,255,255,.2); border-radius:5px; background:#171b1d; color:inherit; }
.actions { display:grid; grid-template-columns:1fr 1fr; gap:10px; padding:10px max(14px,env(safe-area-inset-left)) calc(10px + env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-right)); border-top:1px solid rgba(255,255,255,.1); background:#090b0c; }
.secondary-button,.primary-button { display:inline-flex; min-height:48px; align-items:center; justify-content:center; gap:8px; border-radius:8px; font-weight:900; }
.secondary-button { border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.08); color:inherit; }.primary-button { border:1px solid rgba(119,217,119,.5); background:var(--nds-accent,#77d977); color:#101410; }
.undo-toast { position:absolute; bottom:calc(78px + env(safe-area-inset-bottom)); left:50%; z-index:8; display:flex; min-width:220px; transform:translateX(-50%); align-items:center; gap:18px; border:1px solid rgba(255,255,255,.14); border-radius:8px; background:#202426; padding:10px 12px; box-shadow:0 16px 42px rgba(0,0,0,.4); }
.undo-toast span { flex:1; }.undo-toast button { border:0; background:transparent; color:var(--nds-accent,#77d977); font-weight:900; }
.dialog-backdrop { position:absolute; inset:0; z-index:20; display:grid; place-items:end center; overflow-y:auto; background:rgba(4,5,6,.72); padding:18px; backdrop-filter:blur(18px); }
.file-name-dialog { width:min(100%,420px); max-height:100%; overflow-y:auto; border:1px solid rgba(255,255,255,.14); border-radius:8px; background:#111416; padding:18px; box-shadow:0 28px 80px rgba(0,0,0,.42); }
.dialog-header { margin-bottom:16px; }.dialog-header h2 { margin:0; }.dialog-eyebrow { margin:0 0 6px; color:#f6b942; font-size:11px; font-weight:900; letter-spacing:.14em; text-transform:uppercase; }
.file-name-field { display:grid; gap:8px; font-size:12px; font-weight:900; }.file-name-field input { width:100%; min-height:48px; border:1px solid rgba(255,255,255,.18); border-radius:8px; background:rgba(255,255,255,.08); padding:0 13px; color:inherit; font-size:16px; }
.save-error { border-radius:8px; background:rgba(126,30,30,.72); padding:10px; }.dialog-actions { display:grid; grid-template-columns:1fr 1.2fr; gap:10px; margin-top:16px; }.dialog-actions button { min-height:46px; border-radius:8px; font-weight:900; }.dialog-secondary { border:1px solid rgba(255,255,255,.16); background:rgba(255,255,255,.08); color:inherit; }.dialog-primary { border:1px solid rgba(119,217,119,.6); background:#77d977; color:#101410; }
@media (prefers-reduced-motion:reduce) { .track { transition:none; } }
@media (prefers-reduced-transparency:reduce) { .dialog-backdrop,.review-processing { backdrop-filter:none; background:#080a0c; } }
</style>
