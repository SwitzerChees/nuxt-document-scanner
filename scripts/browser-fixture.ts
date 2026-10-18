import { readFileSync } from 'node:fs'

// Output a localhost-only browser fixture, including the existing licensed DocAligner test card.
// The 512px reference is deliberately upscaled: this tests resolution/data flow, not optical quality.
const card = readFileSync(new URL('../test/fixtures/quality/run_test_card.jpg', import.meta.url)).toString('base64')
console.log(`(async () => {
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local fixture only')
  const image = new Image()
  image.src = 'data:image/jpeg;base64,${card}'
  await image.decode()
  const photo = document.createElement('canvas')
  photo.width = 2400; photo.height = 3200
  photo.getContext('2d').drawImage(image, 0, 0, photo.width, photo.height)
  const blob = await new Promise(resolve => photo.toBlob(resolve, 'image/jpeg', .98))
  const preview = document.createElement('canvas')
  preview.width = 640; preview.height = 853
  let hidden = false
  const paint = () => {
    const ctx = preview.getContext('2d')
    ctx.fillStyle = '#515764'; ctx.fillRect(0, 0, 640, 853)
    if (!hidden) ctx.drawImage(photo, 0, 0, 640, 853)
    requestAnimationFrame(paint)
  }
  paint()
  const fixture = window.scannerFixture = { photo, blob, streams: [], calls: 0, timings: [], longTasks: [], hide: value => { hidden = value } }
  const NativeWorker = window.Worker
  window.Worker = class extends NativeWorker {
    jobs = new Map()
    constructor(...args) {
      super(...args)
      this.addEventListener('message', ({ data }) => {
        const job = this.jobs.get(data.id)
        if (data.result?.confidence !== undefined) fixture.lastDetection = data.result
        if (data.result?.processed) fixture.lastPage = data.result
        if (job) { fixture.timings.push({ type: job.type, ms: performance.now() - job.at, error: data.error }); this.jobs.delete(data.id) }
      })
    }
    postMessage(message, ...args) { this.jobs.set(message.id, { type: message.type, at: performance.now() }); return super.postMessage(message, ...args) }
  }
  navigator.mediaDevices.getUserMedia = async constraints => {
    const stream = preview.captureStream(30)
    const track = stream.getVideoTracks()[0], settings = track.getSettings.bind(track)
    track.getSettings = () => ({ ...settings(), deviceId: constraints.video.deviceId?.exact || 'fixture-rear' })
    fixture.streams.push(stream)
    return stream
  }
  navigator.mediaDevices.enumerateDevices = async () => [
    { kind: 'videoinput', deviceId: 'fixture-rear', label: 'Fixture rear camera' },
    { kind: 'videoinput', deviceId: 'fixture-front', label: 'Fixture second camera' },
  ]
  window.ImageCapture = class {
    async getPhotoCapabilities() { return { imageWidth: { max: 2400 }, imageHeight: { max: 3200 } } }
    async takePhoto() { fixture.calls++; return blob }
  }
  new PerformanceObserver(list => fixture.longTasks.push(...list.getEntries().map(e => e.duration))).observe({ type: 'longtask', buffered: false })
  return { width: photo.width, height: photo.height, bytes: blob.size }
})()`)
