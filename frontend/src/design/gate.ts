import { composite, parseColour, type Rgba } from './contrast'

export const TEXT = 7
export const INDICATOR = 3

export type Run = 'base' | 'more'
export type Tokens = ReadonlyMap<string, string>
export type Ground = { token: string; over?: string }
export type Pair = { foreground: string; ground: Ground; floor: number }

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const reference = (value: string) => /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(value)?.[1]

const block = (body: string, where: string): Map<string, string> => {
  const tokens = new Map<string, string>()
  for (const part of body.split(';').map(text => text.trim()).filter(Boolean)) {
    // A value holds no colon, so a missing semicolon cannot merge two declarations.
    const declaration = /^(--[a-z0-9-]+)\s*:\s*([^:]+)$/.exec(part)
    if (!declaration) throw new Error(`not a custom property in ${where}: ${part}`)
    const [, name, value] = declaration
    if (tokens.has(name)) throw new Error(`${name} is declared twice in ${where}`)
    tokens.set(name, value.trim())
  }
  return tokens
}

const shape = new RegExp(
  String.raw`^:root\s*\{([^{}]*)\}\s*` +
  String.raw`@media\s*\(\s*prefers-contrast\s*:\s*more\s*\)\s*\{\s*:root\s*\{([^{}]*)\}\s*\}$`, 'i')

// Both token files: the base run is the :root block; the more run lays the more block over it.
const parseRuns = (css: string, file: string): Record<Run, Tokens> => {
  const blocks = shape.exec(stripComments(css).trim())
  if (!blocks) {
    throw new Error(`${file} must hold one :root block, then one @media (prefers-contrast: more) block`)
  }
  const base = block(blocks[1], ':root')
  return { base, more: new Map([...base, ...block(blocks[2], 'the more block')]) }
}

export const parseTokens = (css: string) => parseRuns(css, 'tokens.css')

// Each run's values are checked against that run, so an overridden base value is checked too.
export const parseColours = (css: string): Record<Run, Tokens> => {
  const runs = parseRuns(css, 'colours.css')
  for (const tokens of Object.values(runs)) {
    for (const [name, value] of tokens) {
      const target = reference(value)
      if (target === undefined) parseColour(value)
      else if (!tokens.has(target)) throw new Error(`${name} refers to ${target}, which is not a colour token`)
    }
  }
  return runs
}

// The tokens a name passes through, itself first, the last holding a literal colour.
const chain = (tokens: Tokens, name: string): string[] => {
  const path = [name]
  for (;;) {
    const value = tokens.get(path[path.length - 1])
    if (value === undefined) throw new Error(`${path[path.length - 1]} is not declared`)
    const target = reference(value)
    if (target === undefined) return path
    if (path.includes(target)) {
      throw new Error(`${target} refers to itself through ${path.slice(path.indexOf(target)).join(', ')}`)
    }
    path.push(target)
  }
}

const resolve = (tokens: Tokens, name: string): Rgba => {
  const path = chain(tokens, name)
  return parseColour(tokens.get(path[path.length - 1])!)
}

// The ground over its surface, then the foreground over the ground, as the browser paints them.
export const paint = (tokens: Tokens, pair: Pair): [Rgba, Rgba] => {
  const { token, over } = pair.ground
  const top = resolve(tokens, token)
  if (top.a < 1 && over === undefined) throw new Error(`${token} has alpha but no surface`)
  const ground = over === undefined ? top : composite(top, resolve(tokens, over))
  return [composite(resolve(tokens, pair.foreground), ground), ground]
}

const surfaces: Ground[] = ['--paper', '--paper-warm', '--paper-pale'].map(token => ({ token }))
const tints: Ground[] = ['--paper', '--paper-warm'].map(over => ({ token: '--burgundy-tint', over }))
const fills: Ground[] = ['--card-back', '--grey', '--burgundy'].map(token => ({ token }))
const on = (foreground: string, grounds: Ground[], floor: number): Pair[] =>
  grounds.map(ground => ({ foreground, ground, floor }))

// The 3a spec's table of pairs; the hairline is an indicator only in the more run.
export const pairs = (run: Run): Pair[] => [
  ...['--ink', '--grey'].flatMap(text => on(text, [...surfaces, ...tints], TEXT)),
  ...on('--burgundy-deep', surfaces.slice(0, 2), INDICATOR),
  ...on('--burgundy-deep', tints, TEXT),
  ...on('--paper-warm', fills, TEXT),
  ...['--card-back', '--burgundy'].flatMap(mark => on(mark, surfaces, INDICATOR)),
  ...(run === 'more' ? on('--hairline-colour', surfaces, INDICATOR) : [])
]

// Colour tokens no pair reaches in either run, directly or through var(); --pale is decorative.
export const unreached = (runs: Record<Run, Tokens>): string[] => {
  const reached = new Set<string>()
  for (const run of ['base', 'more'] as const) {
    for (const { foreground, ground } of pairs(run)) {
      for (const name of [foreground, ground.token, ground.over]) {
        if (name !== undefined) chain(runs[run], name).forEach(token => reached.add(token))
      }
    }
  }
  return [...runs.more.keys()].filter(name => name !== '--pale' && !reached.has(name))
}

const allowedFunctions = new Set(['calc', 'min', 'max', 'clamp', 'var'])
const allowedUnits = new Set(['rem', 'em', 'ms', 'px'])
// J2: the viewport appears only in the root and the shell's height.
const unitOnlyOn: Record<string, string> = { vmin: '--root-size', dvh: '--shell-height' }

// tokens.css: no colour, no var() to one, J2's units, no px outside a floor but the hairline's.
export const tokenProblems = (
  runs: Record<Run, Tokens>, colourNames: ReadonlySet<string>
): string[] => {
  const problems = new Set<string>()
  for (const [name, value] of [...runs.base, ...runs.more]) {
    const say = (what: string) => problems.add(`${name}: ${what} in ${value}`)
    if (colourNames.has(name)) problems.add(`${name} is a colour token, declared in colours.css`)
    for (const [, fn] of value.matchAll(/([a-z-]+)\(/gi)) {
      if (!allowedFunctions.has(fn.toLowerCase())) say(`${fn}()`)
    }
    if (/#[0-9a-f]{3,8}\b/i.test(value)) say('a hex colour')
    for (const [keyword] of value.matchAll(/\b(transparent|currentcolor)\b/gi)) say(keyword)
    for (const [, target] of value.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
      if (colourNames.has(target)) say(`a colour token, ${target}`)
    }
    for (const [, unit] of value.matchAll(/(?<![\w.#-])\d*\.?\d+([a-z%]+)/gi)) {
      const lower = unit.toLowerCase()
      if (!allowedUnits.has(lower) && unitOnlyOn[lower] !== name) say(`the unit ${unit}`)
    }
    const outsideFloors = value.replace(/max\([^()]*\)/gi, '')
    if (name !== '--line-hairline' && /\dpx\b/i.test(outsideFloors)) say('a px outside max()')
  }
  return [...problems]
}

const defaultRoot = 16
const tallestLaptopVmin = 7.57
const rootShape = new RegExp(
  String.raw`^clamp\(\s*(\d*\.?\d+)rem\s*,\s*(\d*\.?\d+)vmin\s*\+\s*(\d*\.?\d+)rem\s*,\s*(\d*\.?\d+)rem\s*\)$`,
  'i')

// J2's three rules on --root-size in each run, at a default font size of 16 px.
export const rootProblems = (runs: Record<Run, Tokens>): string[] => {
  const problems: string[] = []
  for (const declared of new Set([runs.base.get('--root-size'), runs.more.get('--root-size')])) {
    const terms = declared === undefined ? null : rootShape.exec(declared)
    if (!terms) {
      problems.push(declared === undefined ? '--root-size is missing'
        : `--root-size is not clamp(<min>rem, <a>vmin + <b>rem, <max>rem): ${declared}`)
      continue
    }
    const [min, a, b, max] = terms.slice(1).map(Number)
    if (!(b > 0)) problems.push('the rem term must be above zero')
    if (max > 2.5 * min) problems.push(`the maximum ${max}rem is more than 2.5 times the minimum ${min}rem`)
    if (a * tallestLaptopVmin + b * defaultRoot > min * defaultRoot) {
      problems.push('at a vmin of 757 the root is above its minimum')
    }
  }
  return problems
}
