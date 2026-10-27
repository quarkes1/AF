/** Frontend-review preferences only; not the product's future SQLite store. */
const KEY = 'af.frontend-preview.preferences.v1'
export interface PreviewPreferences { muted: boolean; reducedMotion: boolean }
export function readPreviewPreferences(): PreviewPreferences {
  const systemReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return { muted: value.muted === true, reducedMotion: systemReduced || value.reducedMotion === true }
  } catch { return { muted: false, reducedMotion: systemReduced } }
}
export function writePreviewPreferences(value: PreviewPreferences) {
  try { localStorage.setItem(KEY, JSON.stringify(value)) } catch { /* A restricted preview can still run. */ }
}
