import { useRuntimeConfig } from '#imports'

export async function log(...args: any[]) {
  // Runtime config
  const config = useRuntimeConfig()
  const moduleOptions = (config.public.documentScanner || {}) as any
  if (moduleOptions.logging?.enabled) {
    console.log(...args)
  }
}

export function logError(...args: any[]) {
  // Runtime config
  const config = useRuntimeConfig()
  const moduleOptions = (config.public.documentScanner || {}) as any
  if (moduleOptions.logging?.enabled) {
    // On mobile devices, console.error can cause UI disruptions
    // Use console.warn instead to avoid breaking the UI
    if (/iPhone|iPad|iPod|Android/i.test(navigator?.userAgent || '')) {
      console.warn('🚨', ...args)
    } else {
      console.error(...args)
    }
  }
}

export function logWarn(...args: any[]) {
  // Runtime config
  const config = useRuntimeConfig()
  const moduleOptions = (config.public.documentScanner || {}) as any
  if (moduleOptions.logging?.enabled) {
    console.warn(...args)
  }
}
