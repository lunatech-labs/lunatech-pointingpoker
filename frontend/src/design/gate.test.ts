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
    ['another media query', ':root { --a: #000000; }\n@media (prefers-color-scheme: dark) { :root { } }'],
    ['a second rule in the more block', ':root { }\n@media (prefers-contrast: more) { :root { } .card { } }']
  ])('fails on %s', (_, css) => {
    expect(() => parseColours(css)).toThrow(shapeError)
  })

  it('fails on a token declared twice in one block', () => {
    expect(() => parseColours(file('--a: #000000; --a: #111111;'))).toThrow('--a is declared twice in :root')
  })

  it.each(['red', 'Canvas', 'rgb(0, 0, 0)', 'transparent', 'currentColor'])('fails on the value %j', value => {
    expect(() => parseColours(file(`--a: ${value};`))).toThrow('not a hex or an rgba() colour')
  })

  it('fails on !important', () => {
    expect(() => parseColours(file('--a: #000000 !important;')))
      .toThrow('not a custom property in :root: --a: #000000 !important')
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

  it('hold paper-warm on the card back as an indicator, as the back carries no text', () => {
    const onBack = pairs('base').filter(pair => pair.foreground === '--paper-warm' && pair.ground.token === '--card-back')
    expect(onBack.map(pair => pair.floor)).toEqual([INDICATOR])
  })
})

describe('the colour tokens no pair reaches', () => {
  const every = [
    '--paper: #FCFAF6; --paper-warm: #FFFFFF; --paper-pale: #F7F5F2; --ink: #1C1917; --grey: #58524F;',
    '--burgundy: #9B1A24; --burgundy-deep: #931822; --burgundy-tint: #FEF3F3; --card-back: #DC2F3C;',
    '--mute-soft: #8A8480; --hairline-strong: #8A8480; --pale: #E7E2DC; --hairline-colour: var(--pale);',
    '--bar-other: #DE656D; --notice-ground: #EEF4FF; --notice-ink: #1E3A8A; --notice-bar: #1D4ED8;',
    '--ok: #0F5D2C; --ok-tint: #F1F9F2; --kept: #7F3A07; --kept-tint: #FAF6EC; --track: #EFEBE7;',
    '--pip: rgba(255, 255, 255, 0.85);'
  ].join(' ')
  const more = '--hairline-colour: var(--hairline-strong);'

  it('are none when each token is in a pair, maybe through var() or the more run, but the decorative set', () => {
    expect(unreached(parseColours(file(every, more)))).toEqual([])
  })

  it('leave out the decorative set', () => {
    const decorative = '--mark-offset: #F9C3C6; --shadow-colour: rgba(28, 25, 23, 0.05); --lift-colour: rgba(220, 47, 60, 0.25);'
    expect(unreached(parseColours(file(`${every} ${decorative}`, more)))).toEqual([])
  })

  it('include a token added without a pair', () => {
    expect(unreached(parseColours(file(`${every} --spare: #000000;`, more)))).toEqual(['--spare'])
  })

  it('include a token that only an unchecked var() reaches', () => {
    expect(unreached(parseColours(file(every, '--hairline-colour: #8A8480;')))).toEqual(['--hairline-strong'])
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

  it('allows ms, no unit, em on the label tracking and the tight point, cqi on the value fit, dvh on the shell', () => {
    const fine = '--tracking-label: 0.06em; --tight-point: -0.08em; --value-fit: 66cqi; --b: 180ms; --c: 1.5;'
    expect(problems(`${fine} --d: var(--text-2xl); --shell-height: 100dvh;`)).toEqual([])
  })

  it('allows vh and vw on the root, not vmin', () => {
    expect(problems('--root-size: clamp(1rem, min(1.05vh, 0.82vw) + 0.5rem, 1.75rem);')).toEqual([])
    expect(problems('--root-size: clamp(1rem, 1.05vmin + 0.5rem, 1.75rem);'))
      .toEqual(['--root-size: the unit vmin in clamp(1rem, 1.05vmin + 0.5rem, 1.75rem)'])
  })

  it.each([
    ['--a: 2px;', '--a: a px outside max() in 2px'],
    ['--a: calc(2px + 1rem);', '--a: a px outside max() in calc(2px + 1rem)'],
    ['--a: min(2PX, 1rem);', '--a: a px outside max() in min(2PX, 1rem)'],
    ['--a: rgb(0, 0, 0);', '--a: rgb() in rgb(0, 0, 0)'],
    ['--a: #fff;', '--a: a hex colour in #fff'],
    ['--a: Transparent;', '--a: the word Transparent in Transparent'],
    ['--a: CURRENTCOLOR;', '--a: the word CURRENTCOLOR in CURRENTCOLOR'],
    ['--a: red;', '--a: the word red in red'],
    ['--a: Canvas;', '--a: the word Canvas in Canvas'],
    ['--a: --b;', '--a: the word --b in --b'],
    ['--a: var(--ink);', '--a: a colour token, --ink in var(--ink)'],
    ['--a: 2pt;', '--a: the unit pt in 2pt'],
    ['--a: calc(1rem + 2VW);', '--a: the unit VW in calc(1rem + 2VW)'],
    ['--a: 1vmin;', '--a: the unit vmin in 1vmin'],
    ['--a: 100dvh;', '--a: the unit dvh in 100dvh'],
    ['--a: -2vw;', '--a: the unit vw in -2vw'],
    ['--a: calc(1rem - -.5pt);', '--a: the unit pt in calc(1rem - -.5pt)'],
    ['--a: 0.12em;', '--a: the unit em in 0.12em'],
    ['--a: 66cqi;', '--a: the unit cqi in 66cqi'],
    ['--a: 1vh;', '--a: the unit vh in 1vh'],
    ['--a: 1constructor;', '--a: the unit constructor in 1constructor']
  ])('fails on %s', (declaration, problem) => {
    expect(problems(declaration)).toEqual([problem])
  })

  it('allows the generic font families in any case, and calc()\'s operators', () => {
    const fine = '--a: system-ui, SANS-SERIF, ui-monospace, monospace, ui-serif, serif; --b: calc(1rem + 2rem - 1rem * 2 / 3);'
    expect(problems(fine)).toEqual([])
  })

  it('allows a unit inside a quoted font name', () => {
    expect(problems("--a: 'Inter 18pt', sans-serif;")).toEqual([])
  })

  it('fails on a missing semicolon between two declarations', () => {
    expect(() => parseTokens(file('--a: 1px\n--b: 2rem;'))).toThrow('not a custom property in :root: --a: 1px')
  })

  it.each(['--a: ;', '--a: /* none */;', '--A: 1rem;', '--a_b: 1rem;', '--: 1rem;'])('fails on %j', declaration => {
    expect(() => parseTokens(file(declaration))).toThrow('not a custom property in :root')
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
  const fine = 'clamp(1rem, min(1.05vh, 0.82vw) + 0.5rem, 1.75rem)'
  const notShape = '--root-size is not clamp(<min>rem, min(<a>vh, <c>vw) + <b>rem, <max>rem)'
  const root = (value: string, more = '') =>
    rootProblems(parseTokens(file(`--root-size: ${value};`, more)))

  it('passes the reference clamp', () => {
    expect(root(fine)).toEqual([])
  })

  it('passes the clamp in any case and spacing a formatter may change', () => {
    expect(root('CLAMP( 1REM , MIN( 1.05VH , 0.82VW ) + 0.5REM , 1.75REM )')).toEqual([])
  })

  it('passes any vw coefficient, since the vw term can only lower the root', () => {
    expect(root('clamp(1rem, min(1.05vh, 50vw) + 0.5rem, 1.75rem)')).toEqual([])
  })

  it.each([
    ['no rem term', 'clamp(1rem, min(2vh, 0.82vw) + 0rem, 1.75rem)', 'the rem term must be above zero'],
    [
      'a maximum above 2.5 times the minimum',
      'clamp(1rem, min(1.05vh, 0.82vw) + 0.5rem, 2.6rem)',
      'the maximum 2.6rem is more than 2.5 times the minimum 1rem'
    ],
    [
      'a malformed number',
      'clamp(1rem, min(1.05vh, 0.82vw) + 0.5rem, 1..75rem)',
      `${notShape}: clamp(1rem, min(1.05vh, 0.82vw) + 0.5rem, 1..75rem)`
    ],
    [
      'a root fluid at the tallest laptop',
      'clamp(1rem, min(1.2vh, 0.82vw) + 0.5rem, 1.75rem)',
      'at a height of 757 px the root is above its minimum'
    ],
    ['the vmin form', 'clamp(1rem, 1.05vmin + 0.5rem, 1.75rem)', `${notShape}: clamp(1rem, 1.05vmin + 0.5rem, 1.75rem)`],
    ['no min()', 'clamp(1rem, 1.05vh + 0.5rem, 1.75rem)', `${notShape}: clamp(1rem, 1.05vh + 0.5rem, 1.75rem)`],
    [
      'the terms of min() swapped',
      'clamp(1rem, min(0.82vw, 1.05vh) + 0.5rem, 1.75rem)',
      `${notShape}: clamp(1rem, min(0.82vw, 1.05vh) + 0.5rem, 1.75rem)`
    ]
  ])('fails on %s', (_, value, problem) => {
    expect(root(value)).toEqual([problem])
  })

  it('fails on a root of another shape', () => {
    expect(root('1rem')).toEqual([`${notShape}: 1rem`])
  })

  it('fails when the root is missing', () => {
    expect(rootProblems(parseTokens(file('--text-md: 1rem;')))).toEqual(['--root-size is missing'])
  })

  it('checks the root the more block sets', () => {
    expect(root(fine, '--root-size: 2rem;')).toEqual([`${notShape}: 2rem`])
  })
})
