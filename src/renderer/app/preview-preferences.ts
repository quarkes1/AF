/** Frontend-review preferences only; not the product's future SQLite store. */
import {loadPreferences,savePreferences,type SettingsPreferences} from '../pages/settings/model'
export type PreviewPreferences=SettingsPreferences
export function readPreviewPreferences(): PreviewPreferences {
  return loadPreferences()
}
export function writePreviewPreferences(value: Partial<PreviewPreferences>) {
  return savePreferences({...loadPreferences(),...value})
}
