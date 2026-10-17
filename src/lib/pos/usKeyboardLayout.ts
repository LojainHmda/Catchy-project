/**
 * Physical-key → US-QWERTY character, keyed by `KeyboardEvent.code` rather than
 * `.key`. HID barcode/QR scanners emit raw USB keycodes as if from a US
 * keyboard; the OS translates those into `.key` using whatever input language
 * is *currently active*, so if a cashier's system is set to Arabic at the
 * moment of a scan, `.key` comes back mojibake'd through that layout while
 * `.code` (the physical key position) is unaffected. Rebuilding scanned text
 * from `.code` makes scanning work the same regardless of the active layout.
 */
const UNSHIFTED: Record<string, string> = {
  KeyA: 'a', KeyB: 'b', KeyC: 'c', KeyD: 'd', KeyE: 'e', KeyF: 'f', KeyG: 'g',
  KeyH: 'h', KeyI: 'i', KeyJ: 'j', KeyK: 'k', KeyL: 'l', KeyM: 'm', KeyN: 'n',
  KeyO: 'o', KeyP: 'p', KeyQ: 'q', KeyR: 'r', KeyS: 's', KeyT: 't', KeyU: 'u',
  KeyV: 'v', KeyW: 'w', KeyX: 'x', KeyY: 'y', KeyZ: 'z',
  Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
  Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
  Numpad0: '0', Numpad1: '1', Numpad2: '2', Numpad3: '3', Numpad4: '4',
  Numpad5: '5', Numpad6: '6', Numpad7: '7', Numpad8: '8', Numpad9: '9',
  NumpadDecimal: '.', NumpadDivide: '/', NumpadSubtract: '-', NumpadAdd: '+',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Semicolon: ';', Quote: "'", Backquote: '`', Backslash: '\\',
  Comma: ',', Period: '.', Slash: '/', Space: ' ',
};

const SHIFTED: Record<string, string> = {
  KeyA: 'A', KeyB: 'B', KeyC: 'C', KeyD: 'D', KeyE: 'E', KeyF: 'F', KeyG: 'G',
  KeyH: 'H', KeyI: 'I', KeyJ: 'J', KeyK: 'K', KeyL: 'L', KeyM: 'M', KeyN: 'N',
  KeyO: 'O', KeyP: 'P', KeyQ: 'Q', KeyR: 'R', KeyS: 'S', KeyT: 'T', KeyU: 'U',
  KeyV: 'V', KeyW: 'W', KeyX: 'X', KeyY: 'Y', KeyZ: 'Z',
  Digit0: ')', Digit1: '!', Digit2: '@', Digit3: '#', Digit4: '$',
  Digit5: '%', Digit6: '^', Digit7: '&', Digit8: '*', Digit9: '(',
  Minus: '_', Equal: '+', BracketLeft: '{', BracketRight: '}',
  Semicolon: ':', Quote: '"', Backquote: '~', Backslash: '|',
  Comma: '<', Period: '>', Slash: '?', Space: ' ',
};

/** Returns the US-layout character for a physical key, or null if it's not a printable key we track. */
export function usCharForCode(code: string, shiftKey: boolean): string | null {
  const table = shiftKey ? SHIFTED : UNSHIFTED;
  return table[code] ?? null;
}
