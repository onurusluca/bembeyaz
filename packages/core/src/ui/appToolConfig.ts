import type { UiToolId, DrawToolName } from './appIcons.js'

export const TOOLS: readonly { id: UiToolId; hotkey: string }[] = [
  { id: 'select', hotkey: '1' },
  { id: 'hand', hotkey: '2' },
  { id: 'erase', hotkey: '3' },
]

export const DRAW_TOOLS: readonly { id: DrawToolName; hotkey: string }[] = [
  { id: 'pen', hotkey: '4' },
  { id: 'rectangle', hotkey: '5' },
  { id: 'ellipse', hotkey: '6' },
  { id: 'line', hotkey: '7' },
  { id: 'arrow', hotkey: '8' },
  { id: 'text', hotkey: '9' },
  { id: 'image', hotkey: 'i' },
  { id: 'laser', hotkey: '0' },
]
