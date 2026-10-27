type KeyInput = { key: string; repeat?: boolean; isComposing?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }
export function shouldSkipStartup(event: KeyInput, focus: 'button' | 'editable' | 'none') {
  if (event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || focus === 'editable') return false
  if (event.key === 'Escape') return true
  return focus !== 'button' && [' ', 'Enter'].includes(event.key)
}
export function shouldEnterFromTitle(event: KeyInput, focus: 'button' | 'editable' | 'none') {
  if (event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || focus === 'editable') return false
  if (['Shift','Control','Alt','Meta','OS','Tab','Process','Dead','Unidentified'].includes(event.key)) return false
  if (focus === 'button' && [' ','Enter'].includes(event.key)) return false
  return true
}
