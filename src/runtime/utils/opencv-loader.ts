/**
 * OpenCV.js Dynamic Loader
 * Loads OpenCV from URL for reliable initialization
 */

let cvReady = false
let cvLoadPromise: Promise<void> | null = null

/**
 * Load and initialize OpenCV from URL
 * Returns a promise that resolves when OpenCV is ready
 */
export async function loadOpenCV(opencvUrl: string): Promise<void> {
  // If already loaded, return immediately
  if (cvReady) {
    console.log('✅ OpenCV already loaded')
    return Promise.resolve()
  }

  // If loading is in progress, return existing promise
  if (cvLoadPromise) {
    console.log('⏳ OpenCV loading in progress...')
    return cvLoadPromise
  }

  // Check if cv is already available globally
  if ('cv' in globalThis && (globalThis as any).cv?.Mat) {
    cvReady = true
    console.log('✅ OpenCV already available globally')
    return Promise.resolve()
  }

  console.log('📦 Loading OpenCV from:', opencvUrl)

  // Start loading
  cvLoadPromise = new Promise<void>((resolve, reject) => {
    // Create script element
    const script = document.createElement('script')
    script.src = opencvUrl
    script.async = true

    // Set up timeout
    const timeout = setTimeout(() => {
      console.error('❌ OpenCV loading timeout after 30 seconds')
      document.head.removeChild(script)
      cvLoadPromise = null
      reject(new Error('OpenCV loading timeout'))
    }, 30000)

    // Handle successful load
    script.onload = () => {
      console.log('✅ OpenCV script loaded from URL:', opencvUrl)

      // OpenCV needs time to initialize its WASM module
      // It will call Module.onRuntimeInitialized when ready
      const checkInterval = setInterval(() => {
        if ('cv' in globalThis && (globalThis as any).cv?.Mat) {
          clearTimeout(timeout)
          clearInterval(checkInterval)
          cvReady = true
          console.log('✅ OpenCV WASM initialized and ready')
          resolve()
        }
      }, 100)

      // Also try to hook into onRuntimeInitialized if available
      if ((globalThis as any).cv) {
        ;(globalThis as any).cv.onRuntimeInitialized = () => {
          clearTimeout(timeout)
          clearInterval(checkInterval)
          cvReady = true
          console.log('✅ OpenCV ready via onRuntimeInitialized')
          resolve()
        }
      }
    }

    // Handle load error
    script.onerror = () => {
      clearTimeout(timeout)
      console.error('❌ Failed to load OpenCV script from URL:', opencvUrl)
      document.head.removeChild(script)
      cvLoadPromise = null
      reject(new Error(`Failed to load OpenCV from URL: ${opencvUrl}`))
    }

    // Append script to document
    document.head.appendChild(script)
  })

  return cvLoadPromise
}

/**
 * Check if OpenCV is ready to use
 */
export function isOpenCVReady(): boolean {
  return cvReady && 'cv' in globalThis && !!(globalThis as any).cv?.Mat
}

/**
 * Get the OpenCV instance
 * Throws error if not loaded
 */
export function getCV(): any {
  if (!isOpenCVReady()) {
    throw new Error('OpenCV not loaded. Call loadOpenCV() first.')
  }
  return (globalThis as any).cv
}
