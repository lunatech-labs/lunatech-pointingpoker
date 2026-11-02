import { describe, expect, it } from 'vitest'
import { composite, contrast, parseColour, type Vision } from './contrast'

const paper = '#FCFAF6'
const paperPale = '#F0EBE2'
const ink = '#1E1815'
const white = '#FFFFFF'
const siteBurgundy = '#952B30'
const siteTint = 'rgba(149, 43, 48, 0.08)'

const ratio = (foreground: string, ground: string, vision: Vision) =>
  contrast(parseColour(foreground), parseColour(ground), vision).toFixed(2)

// Every figure in ui-reference.md's "Brand source" and J6 log, from the colours it names.
const figures: [string, Vision, string, string, string][] = [
  ['burgundy on paper', 'normal', siteBurgundy, paper, '7.56'],
  ['burgundy-deep on paper', 'normal', '#5C1C20', paper, '12.27'],
  ['ink on paper', 'normal', ink, paper, '16.83'],
  ['ink-soft on paper', 'normal', '#3B312C', paper, '12.12'],
  ['mute on paper', 'normal', '#6B5E54', paper, '6.01'],
  ['mute-soft on paper', 'normal', '#8A7A70', paper, '3.95'],
  ['white on burgundy', 'normal', white, siteBurgundy, '7.88'],
  ['burgundy against ink', 'normal', siteBurgundy, ink, '2.23'],
  ['burgundy against ink', 'protanopia', siteBurgundy, ink, '1.79'],
  ['burgundy on paper', 'deuteranopia', siteBurgundy, paper, '6.67'],
  ['white on burgundy', 'deuteranopia', white, siteBurgundy, '6.95'],
  ["the app's burgundy on paper", 'deuteranopia', '#8E292E', paper, '7.14'],
  ["white on the app's burgundy", 'deuteranopia', white, '#8E292E', '7.43'],
  ['ink on paper-pale', 'normal', ink, paperPale, '14.78'],
  ['ink on paper-pale', 'protanopia', ink, paperPale, '14.78'],
  ['ink on paper-pale', 'deuteranopia', ink, paperPale, '14.77'],
  ['ink on paper-pale', 'tritanopia', ink, paperPale, '14.77']
]

// J6's burgundy-deep on the site's tint over paper.
const tintFigures: [Vision, string][] = [
  ['normal', '10.75'],
  ['protanopia', '11.99'],
  ['deuteranopia', '10.07'],
  ['tritanopia', '10.75']
]

describe('the contrast method', () => {
  it.each(['normal', 'protanopia', 'deuteranopia', 'tritanopia'] as const)(
    'rates black on white 21 under %s', vision => {
      expect(ratio('#000000', white, vision)).toBe('21.00')
    })

  it.each(figures)('rates %s under %s as the reference states', (_, vision, foreground, ground, figure) => {
    expect(ratio(foreground, ground, vision)).toBe(figure)
  })

  it("composites the site's tint over paper in sRGB, rounded to 8 bits", () => {
    expect(composite(parseColour(siteTint), parseColour(paper))).toEqual({ r: 244, g: 233, b: 230, a: 1 })
  })

  it.each(tintFigures)("rates burgundy-deep on the site's tint over paper under %s at %s", (vision, figure) => {
    const tint = composite(parseColour(siteTint), parseColour(paper))
    expect(contrast(parseColour('#5C1C20'), tint, vision).toFixed(2)).toBe(figure)
  })

  it('does not depend on which colour is the foreground', () => {
    expect(ratio(paper, ink, 'tritanopia')).toBe(ratio(ink, paper, 'tritanopia'))
  })
})

describe('reading a colour', () => {
  it.each(['#8e292e', '#8E292E', ' #8E292E '])('reads the hex %j', text => {
    expect(parseColour(text)).toEqual({ r: 142, g: 41, b: 46, a: 1 })
  })

  it('reads a short hex as its long form', () => {
    expect(parseColour('#fA0')).toEqual(parseColour('#FFAA00'))
  })

  it.each(['rgba(142, 41, 46, 0.08)', 'RGBA( 142 ,41, 46 , .08 )'])('reads the rgba() %j', text => {
    expect(parseColour(text)).toEqual({ r: 142, g: 41, b: 46, a: 0.08 })
  })

  it.each([
    'red', 'Canvas', 'rgb(1, 2, 3)', '#12345', '#11223344', 'var(--ink)', '',
    'rgba(1, 2, 3, 1..0)', 'rgba(256, 0, 0, 1)', 'rgba(0, 0, 0, 1.5)'
  ])(
    'rejects %j', text => {
      expect(() => parseColour(text)).toThrow('not a hex or an rgba() colour')
    })
})
