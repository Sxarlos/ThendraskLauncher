/**
 * Maps between browser input events (KeyboardEvent.code / MouseEvent.button)
 * and Minecraft's GLFW-based key names (key.keyboard.*, key.mouse.*), plus
 * friendly display labels for the Settings UI. Renderer-only — no Electron
 * or main-process imports.
 */

interface KeyEntry {
  code: string
  mcKey: string
  label: string
}

const KEYBOARD_KEYS: KeyEntry[] = [
  ...'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => ({
    code: `Key${c.toUpperCase()}`,
    mcKey: `key.keyboard.${c}`,
    label: c.toUpperCase(),
  })),
  ...'0123456789'.split('').map((d) => ({
    code: `Digit${d}`,
    mcKey: `key.keyboard.${d}`,
    label: d,
  })),
  ...Array.from({ length: 12 }, (_, i) => ({
    code: `F${i + 1}`,
    mcKey: `key.keyboard.f${i + 1}`,
    label: `F${i + 1}`,
  })),
  { code: 'Space', mcKey: 'key.keyboard.space', label: 'Space' },
  { code: 'ShiftLeft', mcKey: 'key.keyboard.left.shift', label: 'Left Shift' },
  { code: 'ShiftRight', mcKey: 'key.keyboard.right.shift', label: 'Right Shift' },
  { code: 'ControlLeft', mcKey: 'key.keyboard.left.control', label: 'Left Ctrl' },
  { code: 'ControlRight', mcKey: 'key.keyboard.right.control', label: 'Right Ctrl' },
  { code: 'AltLeft', mcKey: 'key.keyboard.left.alt', label: 'Left Alt' },
  { code: 'AltRight', mcKey: 'key.keyboard.right.alt', label: 'Right Alt' },
  { code: 'Tab', mcKey: 'key.keyboard.tab', label: 'Tab' },
  { code: 'CapsLock', mcKey: 'key.keyboard.caps.lock', label: 'Caps Lock' },
  { code: 'Enter', mcKey: 'key.keyboard.enter', label: 'Enter' },
  { code: 'Backslash', mcKey: 'key.keyboard.backslash', label: '\\' },
  { code: 'BracketLeft', mcKey: 'key.keyboard.left.bracket', label: '[' },
  { code: 'BracketRight', mcKey: 'key.keyboard.right.bracket', label: ']' },
  { code: 'Semicolon', mcKey: 'key.keyboard.semicolon', label: ';' },
  { code: 'Quote', mcKey: 'key.keyboard.apostrophe', label: "'" },
  { code: 'Comma', mcKey: 'key.keyboard.comma', label: ',' },
  { code: 'Period', mcKey: 'key.keyboard.period', label: '.' },
  { code: 'Slash', mcKey: 'key.keyboard.slash', label: '/' },
  { code: 'Minus', mcKey: 'key.keyboard.minus', label: '-' },
  { code: 'Equal', mcKey: 'key.keyboard.equal', label: '=' },
  { code: 'Backquote', mcKey: 'key.keyboard.grave.accent', label: '`' },
  { code: 'ArrowUp', mcKey: 'key.keyboard.up', label: 'Up Arrow' },
  { code: 'ArrowDown', mcKey: 'key.keyboard.down', label: 'Down Arrow' },
  { code: 'ArrowLeft', mcKey: 'key.keyboard.left', label: 'Left Arrow' },
  { code: 'ArrowRight', mcKey: 'key.keyboard.right', label: 'Right Arrow' },
  ...Array.from({ length: 10 }, (_, i) => ({
    code: `Numpad${i}`,
    mcKey: `key.keyboard.keypad.${i}`,
    label: `Numpad ${i}`,
  })),
  { code: 'NumpadAdd', mcKey: 'key.keyboard.keypad.add', label: 'Numpad +' },
  { code: 'NumpadSubtract', mcKey: 'key.keyboard.keypad.subtract', label: 'Numpad -' },
  { code: 'NumpadMultiply', mcKey: 'key.keyboard.keypad.multiply', label: 'Numpad *' },
  { code: 'NumpadDivide', mcKey: 'key.keyboard.keypad.divide', label: 'Numpad /' },
  { code: 'NumpadDecimal', mcKey: 'key.keyboard.keypad.decimal', label: 'Numpad .' },
  { code: 'NumpadEnter', mcKey: 'key.keyboard.keypad.enter', label: 'Numpad Enter' },
]

const MOUSE_BUTTONS: { button: number; mcKey: string; label: string }[] = [
  { button: 0, mcKey: 'key.mouse.left', label: 'Mouse 1' },
  { button: 1, mcKey: 'key.mouse.middle', label: 'Mouse 3' },
  { button: 2, mcKey: 'key.mouse.right', label: 'Mouse 2' },
  { button: 3, mcKey: 'key.mouse.4', label: 'Mouse 4' },
  { button: 4, mcKey: 'key.mouse.5', label: 'Mouse 5' },
]

const CODE_TO_ENTRY = new Map(KEYBOARD_KEYS.map((k) => [k.code, k]))
const BUTTON_TO_ENTRY = new Map(MOUSE_BUTTONS.map((m) => [m.button, m]))
const MCKEY_TO_LABEL = new Map<string, string>([
  ...KEYBOARD_KEYS.map((k) => [k.mcKey, k.label] as const),
  ...MOUSE_BUTTONS.map((m) => [m.mcKey, m.label] as const),
])

/** Maps a KeyboardEvent.code to the Minecraft GLFW key name, or null if unmapped. */
export function codeToMcKey(code: string): string | null {
  return CODE_TO_ENTRY.get(code)?.mcKey ?? null
}

/** Maps a MouseEvent.button index to the Minecraft key name, or null if unmapped. */
export function mouseButtonToMcKey(button: number): string | null {
  return BUTTON_TO_ENTRY.get(button)?.mcKey ?? null
}

/** Friendly display label for a stored Minecraft key name (e.g. "W", "Left Shift", "Mouse 2"). */
export function friendlyKeyName(mcKey: string | undefined): string {
  if (!mcKey) return 'Not set'
  return MCKEY_TO_LABEL.get(mcKey) ?? mcKey
}

/** Curated list of bindable Minecraft actions shown in Settings, label → action id. */
export const CURATED_ACTIONS: { label: string; action: string }[] = [
  { label: 'Forward', action: 'key.forward' },
  { label: 'Back', action: 'key.back' },
  { label: 'Left', action: 'key.left' },
  { label: 'Right', action: 'key.right' },
  { label: 'Jump', action: 'key.jump' },
  { label: 'Sneak', action: 'key.sneak' },
  { label: 'Sprint', action: 'key.sprint' },
  { label: 'Inventory', action: 'key.inventory' },
  { label: 'Drop Item', action: 'key.drop' },
  { label: 'Chat', action: 'key.chat' },
  { label: 'Swap Offhand', action: 'key.swapOffhand' },
  { label: 'Pick Block', action: 'key.pickItem' },
  { label: 'Attack/Destroy', action: 'key.attack' },
  { label: 'Use Item/Place', action: 'key.use' },
  { label: 'Toggle Perspective', action: 'key.togglePerspective' },
]
