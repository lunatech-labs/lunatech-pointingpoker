import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createContext, runInContext } from 'node:vm'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import dynamicIconImports from 'lucide-react/dynamicIconImports'
import { describe, expect, it } from 'vitest'

// The mockups' copy of lucide's icons; a lucide-react bump that redraws one fails here until icons.js follows.
const names = ['pencil', 'trash', 'link', 'log-out', 'menu', 'eye', 'rotate-ccw', 'check', 'x', 'triangle-alert', 'info', 'arrow-right'] as const satisfies (keyof typeof dynamicIconImports)[]

const context = createContext()
runInContext(readFileSync(fileURLToPath(new URL('../../../docs/design/icons.js', import.meta.url)), 'utf8'), context)
const icons = runInContext('icons', context) as Record<string, unknown>
const icon = runInContext('icon', context) as (name: string) => string

describe("the mockups' icons", () => {
  it('holds exactly the icons the mockups draw', () => {
    expect(Object.keys(icons)).toEqual(names)
  })

  it.each(names)('draws %s as lucide-react does', async name => {
    const { default: Icon } = await dynamicIconImports[name]()
    expect(icon(name)).toBe(renderToStaticMarkup(createElement(Icon)).replace(/ class="[^"]*"/, ''))
  })
})
