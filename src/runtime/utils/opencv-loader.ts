/**
 * OpenCV.js Dynamic Loader
 * Handles loading and initialization of opencv-ts
 */

let cvReady = false
let cvLoadPromise: Promise<void> | null = null

/**
 * Load and initialize OpenCV
 * Returns a promise that resolves when OpenCV is ready
 */
export async function loadOpenCV(): Promise<void> {
  // If already loaded, return immediately
  if (cvReady) return Promise.resolve()

  // If loading is in progress, return existing promise
  if (cvLoadPromise) return cvLoadPromise

  // Start loading
  cvLoadPromise = new Promise<void>((resolve, reject) => {
    // Check if cv is already available globally
    if ('cv' in globalThis && (globalThis as any).cv?.Mat) {
      cvReady = true
      resolve()
      return
    }

    // Import opencv-ts dynamically
    import('opencv-ts')
      .then((cv) => {
        // Wait for OpenCV to be fully initialized
        if (cv.default) {
          // Some builds expose cv on default export
          ;(globalThis as any).cv = cv.default
        } else {
          // Others expose cv directly
          ;(globalThis as any).cv = cv
        }

        // OpenCV might need time to initialize WASM
        const checkReady = () => {
          if ((globalThis as any).cv?.Mat) {
            cvReady = true
            console.log('✅ OpenCV loaded successfully')
            resolve()
          } else {
            setTimeout(checkReady, 50)
          }
        }
        checkReady()
      })
      .catch((err) => {
        console.error('❌ Failed to load OpenCV:', err)
        cvLoadPromise = null
        reject(err)
      })
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
