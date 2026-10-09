import postcss, { type AtRule, type ChildNode, type Container, type Rule } from 'postcss'
import valueParser, { type Node } from 'postcss-value-parser'
import { composite, parseColour, type Rgba } from './contrast'

export const TEXT = 7
export const INDICATOR = 3

export type Run = 'base' | 'more'
export type Tokens = ReadonlyMap<string, string>
export type Ground = { token: string; over?: string }
export type Pair = { foreground: string; ground: Ground; floor: number }

const reference = (value: string) => /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(value)?.[1]

const content = (container: Container) => container.nodes?.filter(node => node.type !== 'comment') ?? []
const isRoot = (node?: ChildNode): node is Rule => node?.type === 'rule' && node.selector.toLowerCase() === ':root'
const isMore = (node?: ChildNode): node is AtRule => node?.type === 'atrule' && /^media$/i.test(node.name) &&
  /^\(\s*prefers-contrast\s*:\s*more\s*\)$/i.test(node.params)

const block = (rule: Rule, where: string): Map<string, string> => {
  const tokens = new Map<string, string>()
  for (const node of content(rule)) {
    const custom = node.type === 'decl' && /^--[a-z0-9-]+$/.test(node.prop) && node.value.trim() !== ''
    // A value holds no colon, so a missing semicolon cannot merge two declarations.
    if (!custom || node.value.includes(':') || node.important) {
      throw new Error(`not a custom property in ${where}: ${node.toString()}`)
    }
    if (tokens.has(node.prop)) throw new Error(`${node.prop} is declared twice in ${where}`)
    tokens.set(node.prop, node.value.trim())
  }
  return tokens
}

// Both token files: the base run is the :root block; the more run lays the more block over it.
const parseRuns = (css: string, file: string): Record<Run, Tokens> => {
  const [root, media, ...rest] = content(postcss.parse(css))
  const [more, ...others] = isMore(media) ? content(media) : []
  if (!isRoot(root) || !isRoot(more) || rest.length > 0 || others.length > 0) {
    throw new Error(`${file} must hold one :root block, then one @media (prefers-contrast: more) block`)
  }
  const base = block(root, ':root')
  return { base, more: new Map([...base, ...block(more, 'the more block')]) }
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

// '' allows bare parentheses and a number with no unit.
const allowedFunctions = new Set(['', 'calc', 'min', 'max', 'clamp', 'var'])
const allowedUnits = new Set(['', 'rem', 'em', 'ms', 'px'])
// J2: the viewport appears only in the root and the shell's height.
const unitOnlyOn: Record<string, string> = { vmin: '--root-size', dvh: '--shell-height' }

// Each node of a value with the name of the function it sits directly in.
const walk = (nodes: Node[], visit: (node: Node, inside?: string) => void, inside?: string) => {
  for (const node of nodes) {
    visit(node, inside)
    if (node.type === 'function') walk(node.nodes, visit, node.value.toLowerCase())
  }
}

// tokens.css: no colour, no var() to one, J2's units, no px outside a floor but the hairline's.
export const tokenProblems = (
  runs: Record<Run, Tokens>, colourNames: ReadonlySet<string>
): string[] => {
  const problems = new Set<string>()
  for (const [name, value] of [...runs.base, ...runs.more]) {
    const say = (what: string) => problems.add(`${name}: ${what} in ${value}`)
    if (colourNames.has(name)) problems.add(`${name} is a colour token, declared in colours.css`)
    walk(valueParser(value).nodes, (node, inside) => {
      if (node.type === 'function' && !allowedFunctions.has(node.value.toLowerCase())) say(`${node.value}()`)
      if (node.type !== 'word') return
      if (node.value.startsWith('#')) say('a hex colour')
      if (/^(transparent|currentcolor)$/i.test(node.value)) say(node.value)
      if (inside === 'var' && colourNames.has(node.value)) say(`a colour token, ${node.value}`)
      const unit = valueParser.unit(node.value)
      if (!unit) return
      const lower = unit.unit.toLowerCase()
      if (!allowedUnits.has(lower) && unitOnlyOn[lower] !== name) say(`the unit ${unit.unit}`)
      if (lower === 'px' && inside !== 'max' && name !== '--line-hairline') say('a px outside max()')
    })
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
