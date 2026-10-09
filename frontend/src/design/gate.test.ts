import { describe, expect, it } from 'vitest'
import {
  INDICATOR,
  TEXT,
  paint,
  pairs,
  parseColours,
  parseTokens,
  rootProblems,
  tokenProblems,
  unreached
} from './gate'

const file = (base: string, more = '') =>
  `:root { ${base} }\n@media (prefers-contrast: more) { :root { ${more} } }`
const shapeError = 'one :root block, then one @media (prefers-contrast: more) block'

describe('reading colours.css', () => {
  it('lays the more block over the :root values', () => {
    const runs = parseColours(file('--a: #000000; --b: var(--a);', '--b: #FFFFFF;'))
    expect(Object.fromEntries(runs.base)).toEqual({ '--a': '#000000', '--b': 'var(--a)' })
    expect(Object.fromEntries(runs.more)).toEqual({ '--a': '#000000', '--b': '#FFFFFF' })
  })

  it('ignores comments, case and spacing a formatter may change', () => {
    const css = '/* the colours */\n:ROOT{--a:#000;/* one */--b:VAR( --a );}\n@MEDIA (PREFERS-CONTRAST:MORE){:root{}}'
    expect(Object.fromEntries(parseColours(css).base)).toEqual({ '--a': '#000', '--b': 'VAR( --a )' })
  })

  it.each([
    ['another rule', `${file('--a: #000000;')}\n.card { color: red; }`],
    ['a second :root block', `:root { --a: #000000; }\n${file('--b: #000000;')}`],
    ['the more block first', '@media (prefers-contrast: more) { :root { } }\n:root { --a: #000000; }'],
    ['another media query', ':root { --a: #000000; }\n@media (prefers-color-scheme: dark) { :root { } }']
  ])('fails on %s', (_, css) => {
    expect(() => parseColours(css)).toThrow(shapeError)
  })

  it('fails on a token declared twice in one block', () => {
    expect(() => parseColours(file('--a: #000000; --a: #111111;'))).toThrow('--a is declared twice in :root')
  })

  it.each(['red', 'Canvas', 'rgb(0, 0, 0)', 'transparent', 'currentColor'])('fails on the value %j', value => {
    expect(() => parseColours(file(`--a: ${value};`))).toThrow('not a hex or an rgba() colour')
  })

  it('fails on a var() to a token colours.css does not declare', () => {
    expect(() => parseColours(file('--a: var(--b);'))).toThrow('--a refers to --b, which is not a colour token')
  })

  it('checks a :root value the more block overrides', () => {
    expect(() => parseColours(file('--a: rgb(0 0 0);', '--a: #000000;')))
      .toThrow('not a hex or an rgba() colour')
  })

  it('fails on a :root var() to a token only the more block declares', () => {
    expect(() => parseColours(file('--a: var(--b);', '--b: #000000;')))
      .toThrow('--a refers to --b, which is not a colour token')
  })
})

describe('painting a pair', () => {
  const pair = (foreground: string, token: string, over?: string) =>
    ({ foreground, ground: { token, over }, floor: TEXT })
  const grey = (level: number) => ({ r: level, g: level, b: level, a: 1 })

  it('composites a ground with alpha over its surface, then the foreground over the ground', () => {
    const tokens = parseColours(file('--fg: rgba(0, 0, 0, 0.5); --tint: rgba(0, 0, 0, 0.5); --paper: #FFFFFF;'))
    expect(paint(tokens.base, pair('--fg', '--tint', '--paper'))).toEqual([grey(64), grey(128)])
  })

  it('fails on a ground with alpha and no surface under it', () => {
    const tokens = parseColours(file('--fg: #000000; --back: rgba(0, 0, 0, 0.5);'))
    expect(() => paint(tokens.base, pair('--fg', '--back'))).toThrow('--back has alpha but no surface')
  })

  it('fails on a var() cycle rather than looping', () => {
    const tokens = parseColours(file('--a: var(--b); --b: var(--a); --c: #000000;'))
    expect(() => paint(tokens.base, pair('--c', '--a'))).toThrow('--a refers to itself')
  })

  it('names only the tokens in a cycle a var() leads into', () => {
    const tokens = parseColours(file('--x: var(--a); --a: var(--b); --b: var(--a); --c: #000000;'))
    expect(() => paint(tokens.base, pair('--c', '--x'))).toThrow('--a refers to itself through --a, --b')
  })
})

describe('the pairs', () => {
  it('hold text at 7:1 and indicators at 3:1', () => {
    expect(new Set(pairs('more').map(pair => pair.floor))).toEqual(new Set([TEXT, INDICATOR]))
  })

  it('check the hairline in the more run only', () => {
    const hairline = (run: 'base' | 'more') =>
      pairs(run).filter(pair => pair.foreground === '--hairline-colour').map(pair => pair.ground.token)
    expect(hairline('base')).toEqual([])
    expect(hairline('more')).toEqual(['--paper', '--paper-warm', '--paper-pale'])
  })
})

describe('the colour tokens no pair reaches', () => {
  const every = [
    '--paper: #FCFAF6; --paper-warm: #FEFDFB; --paper-pale: #F0EBE2; --ink: #1E1815; --grey: #554B43;',
    '--burgundy: #8E292E; --burgundy-deep: #5C1C20; --burgundy-tint: rgba(142, 41, 46, 0.08);',
    '--card-back: var(--ink); --mute-soft: #8A7A70; --pale: #D6CABB; --hairline-colour: var(--pale);'
  ].join(' ')
  const more = '--hairline-colour: var(--mute-soft);'

  it('are none when each token is in a pair, maybe through var() or the more run, but --pale', () => {
    expect(unreached(parseColours(file(every, more)))).toEqual([])
  })

  it('include a token added without a pair', () => {
    expect(unreached(parseColours(file(`${every} --spare: #000000;`, more)))).toEqual(['--spare'])
  })

  it('include a token that only an unchecked var() reaches', () => {
    expect(unreached(parseColours(file(every, '--hairline-colour: #8A7A70;')))).toEqual(['--mute-soft'])
  })
})

describe('what tokens.css may hold', () => {
  const problems = (base: string, more = '') =>
    tokenProblems(parseTokens(file(base, more)), new Set(['--ink']))

  it('fails on any rule but its two blocks', () => {
    expect(() => parseTokens(`${file('--a: 1rem;')}\nhtml { font-size: 12px; }`))
      .toThrow(`tokens.css must hold ${shapeError}`)
  })

  it('allows rem, a px floor inside max(), and px on the hairline alone', () => {
    const fine = '--a: 0.5rem; --b: max(2px, 0.125rem); --c: calc(var(--a) * 2); --line-hairline: 1px;'
    expect(problems(fine)).toEqual([])
  })

  it('allows em, ms, no unit, vmin on the root and dvh on the shell', () => {
    const fine = '--a: 0.12em; --b: 180ms; --c: 1.5; --d: var(--text-2xl); --shell-height: 100dvh;'
    expect(problems(`${fine} --root-size: clamp(1rem, 1.05vmin + 0.5rem, 1.75rem);`)).toEqual([])
  })

  it.each([
    ['--a: 2px;', '--a: a px outside max() in 2px'],
    ['--a: calc(2px + 1rem);', '--a: a px outside max() in calc(2px + 1rem)'],
    ['--a: min(2PX, 1rem);', '--a: a px outside max() in min(2PX, 1rem)'],
    ['--a: rgb(0, 0, 0);', '--a: rgb() in rgb(0, 0, 0)'],
    ['--a: #fff;', '--a: a hex colour in #fff'],
    ['--a: Transparent;', '--a: Transparent in Transparent'],
    ['--a: CURRENTCOLOR;', '--a: CURRENTCOLOR in CURRENTCOLOR'],
    ['--a: var(--ink);', '--a: a colour token, --ink in var(--ink)'],
    ['--a: 2pt;', '--a: the unit pt in 2pt'],
    ['--a: calc(1rem + 2VW);', '--a: the unit VW in calc(1rem + 2VW)'],
    ['--a: 1vmin;', '--a: the unit vmin in 1vmin'],
    ['--a: 100dvh;', '--a: the unit dvh in 100dvh']
  ])('fails on %s', (declaration, problem) => {
    expect(problems(declaration)).toEqual([problem])
  })

  it('fails on a missing semicolon between two declarations', () => {
    expect(() => parseTokens(file('--a: 1px\n--b: 2rem;'))).toThrow('not a custom property in :root: --a: 1px')
  })

  it('reads a last declaration with no semicolon', () => {
    expect(problems('--a: 1rem; --b: 2px')).toEqual(['--b: a px outside max() in 2px'])
  })

  it('checks a :root value the more block overrides', () => {
    expect(problems('--a: 2px;', '--a: 1rem;')).toEqual(['--a: a px outside max() in 2px'])
  })

  it('fails on a colour token declared again', () => {
    expect(problems('--ink: 1rem;')).toEqual(['--ink is a colour token, declared in colours.css'])
  })
})

describe("J2's root", () => {
  const fine = 'clamp(1rem, 1.05vmin + 0.5rem, 1.75rem)'
  const root = (value: string, more = '') =>
    rootProblems(parseTokens(file(`--root-size: ${value};`, more)))

  it('passes the reference clamp', () => {
    expect(root(fine)).toEqual([])
  })

  it.each([
    ['no rem term', 'clamp(1rem, 2vmin + 0rem, 1.75rem)', 'the rem term must be above zero'],
    [
      'a maximum above 2.5 times the minimum',
      'clamp(1rem, 1.05vmin + 0.5rem, 2.6rem)',
      'the maximum 2.6rem is more than 2.5 times the minimum 1rem'
    ],
    [
      'a malformed number',
      'clamp(1rem, 1.05vmin + 0.5rem, 1..75rem)',
      '--root-size is not clamp(<min>rem, <a>vmin + <b>rem, <max>rem): clamp(1rem, 1.05vmin + 0.5rem, 1..75rem)'
    ],
    [
      'a root fluid at the tallest laptop',
      'clamp(1rem, 1.2vmin + 0.5rem, 1.75rem)',
      'at a vmin of 757 the root is above its minimum'
    ]
  ])('fails on %s', (_, value, problem) => {
    expect(root(value)).toEqual([problem])
  })

  it('fails on a root of another shape', () => {
    expect(root('1rem')).toEqual(['--root-size is not clamp(<min>rem, <a>vmin + <b>rem, <max>rem): 1rem'])
  })

  it('fails when the root is missing', () => {
    expect(rootProblems(parseTokens(file('--text-md: 1rem;')))).toEqual(['--root-size is missing'])
  })

  it('checks the root the more block sets', () => {
    expect(root(fine, '--root-size: 2rem;'))
      .toEqual(['--root-size is not clamp(<min>rem, <a>vmin + <b>rem, <max>rem): 2rem'])
  })
})
