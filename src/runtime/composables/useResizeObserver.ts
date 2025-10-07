import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue'

export const useResizeObserver = (
  target: Ref<HTMLElement | undefined>,
  delay = 150,
) => {
  const size = ref({ width: 0, height: 0 })
  const isResizing = ref(false)
  let timeout: NodeJS.Timeout
  let observer: ResizeObserver
  let lastWidth = 0
  let lastHeight = 0

  const stop = () => {
    isResizing.value = false
    size.value = { width: lastWidth, height: lastHeight }
  }

  onMounted(() => {
    if (!target.value) return
    observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry?.contentRect || { width: 0, height: 0 }
      if (width === lastWidth && height === lastHeight) return
      isResizing.value = true
      lastWidth = width
      lastHeight = height
      clearTimeout(timeout)
      timeout = setTimeout(stop, delay) // "resize end" after delay
    })
    observer.observe(target.value)
  })

  onBeforeUnmount(() => observer?.disconnect())

  return { size, isResizing }
}
