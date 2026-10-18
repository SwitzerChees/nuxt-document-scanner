export type CameraCandidate = {
  deviceId: string;
  label: string;
  /** From InputDeviceInfo.getCapabilities() where the browser offers it (Chromium), otherwise undefined. */
  capabilities?: MediaTrackCapabilities & {
    torch?: boolean;
    focusMode?: string[];
  };
}
/**
 * iOS exposes virtual multi-lens cameras next to the physical ones. Only these switch to the ultra-wide lens for
 * close-ups (macro) the way the Camera app does; the plain "Back Camera" (1x) cannot focus closer than ~15–20 cm
 * on Pro models, which is exactly the distance a page is scanned from.
 */
const IOS_PREFERENCE = [/back triple camera/i, /back dual wide camera/i, /back dual camera/i, /back camera$/i]
const IOS_LABEL = /^(?:back|rück|arrière|posterior)/i
const isBack = (camera: CameraCandidate) => {
  const facing = camera.capabilities?.facingMode

  if (Array.isArray(facing) && facing.length)
    return facing.includes('environment')

  return /back|rear|rück|environment|arrière|trasera|posterior/i.test(camera.label)
}
/** Lower is better: lenses that are known to be poor for documents rank last. */
const lensPenalty = (label: string) => {
  if (/ultra ?wide|ultraweit|telephoto|tele|depth|tiefe|macro|infrared|ir\b/i.test(label))
    return 1

  return 0
}
/** Android labels look like "camera2 0, facing back"; the lowest index is usually the main camera. */
const cameraIndex = (label: string) => {
  const match = label.match(/camera2? ?(\d+)/i)

  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}
const maxWidth = (camera: CameraCandidate) => {
  const width = camera.capabilities?.width

  return typeof width === 'object' && width && 'max' in width ? (width.max ?? 0) : 0
}
/**
 * Picks the back camera best suited to photographing a page up close. Returns undefined when nothing is known
 * better than the browser's own `facingMode: environment` choice (e.g. labels are hidden before permission).
 */
export const pickDocumentCamera = (cameras: CameraCandidate[]): string | undefined => {
  const back = cameras.filter((camera) => camera.label && isBack(camera))

  if (back.length < 2)
    return back[0]?.deviceId

  for (const pattern of IOS_PREFERENCE) {
    const match = back.find((camera) => IOS_LABEL.test(camera.label) && pattern.test(camera.label))

    if (match)
      return match.deviceId
  }

  const score = (camera: CameraCandidate) => {
    const focus = camera.capabilities?.focusMode?.includes('continuous') ? 0 : 1

    // The main camera is the one with the flash next to it.

    const torch = camera.capabilities?.torch ? 0 : 1

    return [lensPenalty(camera.label), focus, torch, -maxWidth(camera), cameraIndex(camera.label)]
  }

  const ranked = [...back].sort((a, b) => {
    const sa = score(a)

    const sb = score(b)

    for (let i = 0; i < sa.length; i++)
      if (sa[i] !== sb[i])
        return sa[i]! - sb[i]!

    return 0
  })

  return ranked[0]?.deviceId
}
export type CameraWords = {
  camera: string;
  backCamera: string;
  frontCamera: string;
}
/**
 * Names people recognise: Android reports cameras as "camera2 0, facing back"; those become "Back camera 1",
 * "Back camera 2", "Front camera" in the user's language. Descriptive labels (iOS "Back Triple Camera") stay.
 */
export const friendlyCameraNames = (labels: string[], words: CameraWords) => {
  const technical = /camera2?\s*\d+\s*,\s*facing\s+(back|front)/i

  const facing = labels.map((label) => label.match(technical)?.[1]?.toLowerCase())

  const total = { back: facing.filter((f) => f === 'back').length, front: facing.filter((f) => f === 'front').length }

  const seen = { back: 0, front: 0 }

  return labels.map((label, index) => {
    const side = facing[index] as 'back' | 'front' | undefined

    if (!side)
      return label || `${words.camera} ${index + 1}`

    seen[side]++

    const name = side === 'back' ? words.backCamera : words.frontCamera

    return total[side] > 1 ? `${name} ${seen[side]}` : name
  })
}
