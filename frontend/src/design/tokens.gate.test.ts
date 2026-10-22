import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrast, type Vision } from './contrast'
import { literalProblems, paint, pairs, parseColours, parseTokens, rootProblems, tokenProblems, unreached, type Pair, type Run } from './gate'

// The value source as written; the gate checks token pairs, not a rendered page.
const read = (file: string) => readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8')
// Every stylesheet but the token files and today's styles.css, which each slice replaces.
const stylesheets = readdirSync(fileURLToPath(new URL('..', import.meta.url)), { recursive: true, encoding: 'utf8' })
  .filter(file => file.endsWith('.css') && !['colours.css', 'tokens.css', 'styles.css'].includes(file))
  .sort()
const runs = parseColours(read('colours.css'))
const tokens = parseTokens(read('tokens.css'))

const visions: Vision[] = ['normal', 'protanopia', 'deuteranopia', 'tritanopia']
const groundName = ({ token, over }: Pair['ground']) => (over ? `${token} over ${over}` : token)
const cases = (['base', 'more'] as const).flatMap((run: Run) => pairs(run).flatMap(pair => visions.map(vision => ({
  name: `${run}: ${pair.foreground} on ${groundName(pair.ground)} under ${vision}`, run, pair, vision
}))))

describe('the contrast gate', () => {
  it.each(cases)('$name', ({ run, pair, vision }) => {
    expect(contrast(...paint(runs[run], pair), vision)).toBeGreaterThanOrEqual(pair.floor)
  })

  it('reaches every colour token but the decorative set', () => {
    expect(unreached(runs)).toEqual([])
  })

  it('keeps colours and stray units out of tokens.css', () => {
    expect(tokenProblems(tokens, new Set(runs.more.keys()))).toEqual([])
  })

  it("keeps the root within J2's rules", () => {
    expect(rootProblems(tokens)).toEqual([])
  })

  it("reads the foundation's stylesheets", () => {
    expect(stylesheets).toEqual(expect.arrayContaining(['base.css', 'fonts.css', 'reset.css']))
  })

  it.each(stylesheets)('keeps literal colours and px out of %s', file => {
    expect(literalProblems(read(file))).toEqual([])
  })
})
