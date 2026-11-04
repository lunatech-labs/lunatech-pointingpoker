export type Rgba = { r: number; g: number; b: number; a: number }
export type Vision = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia'

type Matrix = readonly (readonly [number, number, number])[]

// Machado, Oliveira and Fernandes 2009, severity 1, applied to linear RGB.
const machado: Record<Exclude<Vision, 'normal'>, Matrix> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998]
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881]
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039]
  ]
}

export const parseColour = (text: string): Rgba => {
  const value = text.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)?.[1]
  if (hex) {
    const full = hex.length === 3 ? [...hex].map(digit => digit + digit).join('') : hex
    const channel = (at: number) => parseInt(full.slice(at, at + 2), 16)
    return { r: channel(0), g: channel(2), b: channel(4), a: 1 }
  }
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d*\.?\d+)\s*\)$/i.exec(value)?.slice(1).map(Number)
  if (rgba && Math.max(rgba[0], rgba[1], rgba[2]) <= 255 && rgba[3] <= 1) {
    return { r: rgba[0], g: rgba[1], b: rgba[2], a: rgba[3] }
  }
  throw new Error(`not a hex or an rgba() colour: ${text}`)
}

// In sRGB, rounded to 8 bits, as the browser paints it.
export const composite = (top: Rgba, under: Rgba): Rgba => {
  const mix = (over: number, below: number) => Math.round(over * top.a + below * (1 - top.a))
  return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a: 1 }
}

const linear = (channel: number) => {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const luminance = (colour: Rgba, vision: Vision) => {
  const rgb = [linear(colour.r), linear(colour.g), linear(colour.b)]
  const seen = vision === 'normal' ? rgb : machado[vision].map(row =>
    Math.min(1, Math.max(0, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])))
  return 0.2126 * seen[0] + 0.7152 * seen[1] + 0.0722 * seen[2]
}

// WCAG's ratio, unrounded, of two opaque colours as the given vision sees them.
export const contrast = (foreground: Rgba, ground: Rgba, vision: Vision = 'normal') => {
  const [lighter, darker] = [luminance(foreground, vision), luminance(ground, vision)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}
