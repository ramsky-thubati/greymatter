export interface Hsv {
  h: number
  s: number
  v: number
}

export function hexToHsv(hex: string): Hsv {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const hue = ((h % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x]
  const byte = (t: number) => Math.round((t + m) * 255).toString(16).padStart(2, '0')
  return `#${byte(r)}${byte(g)}${byte(b)}`
}
