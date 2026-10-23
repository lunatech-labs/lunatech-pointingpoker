import {
  test,
  expect,
  defaultRoleChoice,
  defaultRoleRadio,
  inRoom,
  nameInput,
  participantEntry
} from './fixtures.js'

// Every font the page asked for has settled, and two frames have been drawn since.
const settle = page =>
  page.evaluate(() =>
    document.fonts.ready.then(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    )
  )

// Chromium only: the fonts that drew a node's text, found for the protocol by a probe attribute.
const painted = async (page, locator) => {
  await locator.evaluate(el => el.setAttribute('data-font-probe', ''))
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument')
    const selector = '[data-font-probe]'
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
    return fonts.map(({ familyName, isCustomFont }) => ({ familyName, isCustomFont }))
  } finally {
    await cdp.detach()
    await locator.evaluate(el => el.removeAttribute('data-font-probe'))
  }
}

// The status of the family's face whose unicode-range covers char; Firefox keeps the quotes.
const faceStatus = (page, family, char) =>
  page.evaluate(
    ([family, code]) => {
      const covers = range =>
        range.split(',').some(part => {
          const [from, to = from] = part
            .trim()
            .slice(2)
            .split('-')
            .map(hex => parseInt(hex, 16))
          return code >= from && code <= to
        })
      const face = [...document.fonts].find(
        f => f.family.replace(/"/g, '') === family && covers(f.unicodeRange)
      )
      return face?.status ?? 'none'
    },
    [family, char.codePointAt(0)]
  )

// The name each file gives itself, as the protocol reports it (checked).
const fileName = { Inter: 'Inter', 'JetBrains Mono': 'JetBrains Mono Medium' }
// Every font that drew the node is the web font; in Firefox, the face for each of chars has loaded.
const expectPainted = async (page, browserName, locator, family, chars) => {
  if (browserName !== 'chromium') {
    for (const char of chars) expect(await faceStatus(page, family, char), char).toBe('loaded')
    return
  }
  const fonts = await painted(page, locator)
  expect(fonts).not.toEqual([])
  for (const font of fonts)
    expect(font).toEqual({ familyName: fileName[family], isCustomFont: true })
}

test('the lobby is drawn in Inter', async ({ page, origin, browserName }) => {
  await page.goto(`${origin}/`)
  await expect(nameInput(page)).toBeVisible()
  await settle(page)
  const heading = page.getByRole('heading', { name: 'Create Room' })
  await expectPainted(page, browserName, heading, 'Inter', 'a')
  await expectPainted(page, browserName, page.getByText('User name'), 'Inter', 'a')
})

test('the room is drawn in Inter, a name in other scripts too, and the room id in JetBrains Mono', async ({
  join,
  room,
  browserName
}) => {
  // Latin-ext, cyrillic, greek and vietnamese, each a face of its own.
  const name = 'Łukasz Дмитрий Νίκος Nguyễn'
  const { page } = await join(name)
  await settle(page)
  await expectPainted(page, browserName, page.getByRole('link', { name: 'Leave' }), 'Inter', 'a')
  const cell = participantEntry(page, name).getByRole('cell', { name, exact: true })
  await expectPainted(page, browserName, cell, 'Inter', 'ŁДΝễ')
  const id = page.getByRole('heading', { name: room, exact: true })
  await expectPainted(page, browserName, id, 'JetBrains Mono', 'a')
})

test("two preloads name the stylesheet's font files, each fetched once", async ({
  page,
  origin,
  room
}) => {
  const fetched = {}
  page.on('request', request => {
    const { pathname } = new URL(request.url())
    if (pathname.endsWith('.woff2')) fetched[pathname] = (fetched[pathname] ?? 0) + 1
  })
  // Joined in place, so both preloaded files are used in this one document.
  await page.goto(`${origin}/${room}`)
  await nameInput(page).fill('Alice')
  await defaultRoleRadio(page, 'Voter').check()
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(inRoom(page)).toBeVisible()
  await settle(page)
  const preloads = await page.locator('link[rel=preload]').evaluateAll(links =>
    links.map(l => ({
      path: new URL(l.href).pathname,
      as: l.getAttribute('as'),
      type: l.getAttribute('type'),
      crossorigin: l.hasAttribute('crossorigin')
    }))
  )
  const faces = await page.evaluate(() =>
    [...document.styleSheets]
      .flatMap(sheet => [...sheet.cssRules])
      .filter(rule => rule instanceof CSSFontFaceRule)
      .map(rule => {
        const src = /url\("?([^")]+)"?\)/.exec(rule.style.getPropertyValue('src'))[1]
        return new URL(src, rule.parentStyleSheet.href).pathname
      })
  )
  expect(preloads).toHaveLength(2)
  for (const preload of preloads) {
    expect(preload).toMatchObject({ as: 'font', type: 'font/woff2', crossorigin: true })
    expect(faces).toContain(preload.path)
    const response = await page.request.get(`${origin}${preload.path}`)
    expect(response.headers()['content-type']).toBe('font/woff2')
  }
  expect(fetched).toEqual(Object.fromEntries(preloads.map(({ path }) => [path, 1])))
})

test('a held-back Inter draws the fallback, then Inter once it arrives', async ({
  page,
  origin,
  browserName
}) => {
  let release
  const held = new Promise(resolve => (release = resolve))
  await page.route('**/assets/inter-latin-wght-normal-*.woff2', async route => {
    await held
    await route.continue()
  })
  // fonts.ready never resolves while the font is held, so the fallback is read first.
  await page.goto(`${origin}/`, { waitUntil: 'commit' })
  await expect(nameInput(page)).toBeVisible()
  await expect.poll(() => faceStatus(page, 'Inter', 'a')).toBe('loading')
  const heading = page.getByRole('heading', { name: 'Create Room' })
  if (browserName === 'chromium') {
    for (const font of await painted(page, heading)) expect(font.isCustomFont).toBe(false)
  }
  // Past optional's block period of about 100 ms, so an optional face would give up in Firefox too.
  await page.waitForTimeout(300)
  release()
  await settle(page)
  await expectPainted(page, browserName, heading, 'Inter', 'a')
})

// The reset sits above Bootstrap; the fence in base.css gives today's markup today's cascade back.
test("today's lobby stays centred and keeps Bootstrap's form spacing", async ({ page, origin }) => {
  await page.goto(`${origin}/`)
  const heading = await page.getByRole('heading', { name: 'Create Room' }).boundingBox()
  // page.css's scrollbar gutter narrows the body in Chromium, which the root's clientWidth omits.
  const width = await page.evaluate(() => document.body.clientWidth)
  const right = width - heading.x - heading.width
  expect(Math.abs(heading.x - right)).toBeLessThan(1)
  const name = await nameInput(page).boundingBox()
  const role = await defaultRoleChoice(page).boundingBox()
  // The name row's form-group margin, 1rem.
  expect(role.y - name.y - name.height).toBeCloseTo(16, 0)
})

test('the stylesheet opens with the licence comment, and its files are served', async ({
  page,
  origin
}) => {
  await page.goto(`${origin}/`)
  const href = await page.locator('link[rel=stylesheet]').getAttribute('href')
  const css = await (await page.request.get(new URL(href, origin).href)).text()
  expect(css.startsWith('/*!')).toBe(true)
  const named = css.slice(0, css.indexOf('*/')).match(/\/assets\/[a-z-]+-OFL\.txt/g)
  expect(named).toEqual(['/assets/inter-OFL.txt', '/assets/jetbrains-mono-OFL.txt'])
  for (const path of named) {
    const response = await page.request.get(`${origin}${path}`)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toMatch(/^text\/plain/)
    expect(await response.text()).toContain('SIL Open Font License')
  }
})
