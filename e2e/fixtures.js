import { test as base, expect } from '@playwright/test'
import { startApp } from '../testkit/app.js'
import { createStub } from '../testkit/stub.js'

// The page is bundled and served by the app, so any other host is a regression. A predicate
// rather than a glob, so same-origin traffic (the stub, the app, the streams) never reaches it.
const isOffOrigin = url => url.hostname !== '127.0.0.1'
const guard = async (context, blocked) => {
  await context.route(isOffOrigin, route => {
    blocked.push(route.request().url())
    return route.abort()
  })
}

export const test = base.extend({
  app: [
    async ({}, use) => {
      const app = await startApp()
      await use(app)
      await app.stop()
    },
    { scope: 'worker' }
  ],

  // Every context the suite opens goes through guard, here and in join, or a page could pass.
  offOrigin: async ({}, use) => {
    const blocked = []
    await use(blocked)
    expect(blocked, 'requests to a host other than 127.0.0.1').toEqual([])
  },

  context: async ({ context, offOrigin }, use) => {
    await guard(context, offOrigin)
    await use(context)
  },

  // Worker-scoped: buffering and the cut list are global to a stub instance, so a shared
  // one would force workers: 1 permanently.
  stub: [
    async ({ app }, use) => {
      const stub = await createStub({ upstream: app.baseUrl })
      await use(stub)
      await stub.close()
    },
    { scope: 'worker' }
  ],

  origin: async ({ stub }, use) => {
    await use(stub.baseUrl)
  },

  // A case that turns buffering on or cuts a session cannot poison the next one.
  cleanStub: [
    async ({ stub }, use) => {
      await use()
      stub.setBuffering(false)
      stub.restore()
    },
    { auto: true }
  ],

  // Per-test isolation without restarting anything.
  room: async ({ app }, use) => {
    const response = await fetch(`${app.baseUrl}/create-room`, { method: 'POST' })
    if (!response.ok) {
      response.body?.cancel().catch(() => {})
      throw new Error(`POST /create-room answered ${response.status}`)
    }
    await use((await response.text()).trim())
  },

  // One browser context per participant: two pages in one context share the room cookie and
  // resolve to a single session, which is what newTab is for.
  join: async ({ browser, origin, room, stub, offOrigin }, use) => {
    const closers = []
    const join = async (name, { initScript } = {}) => {
      const context = await browser.newContext({ baseURL: origin })
      // Tracked before anything else can throw, so a half-built participant is still torn down.
      closers.push(() => context.close())
      await guard(context, offOrigin)
      if (initScript) await context.addInitScript(initScript)
      const page = await context.newPage()
      const token = async () => {
        const cookie = (await context.cookies()).find(c => c.name === 'session')
        if (!cookie) throw new Error(`${name} has no session cookie`)
        return cookie.value
      }
      // A second page in the same context shares the room cookie, which is what makes two tabs
      // one participant. localStorage already holds the name, so the room's path joins at once.
      const newTab = async () => {
        const tab = await context.newPage()
        await tab.goto(`/${room}`)
        await expect(tab.getByRole('button', { name: 'Show votes' })).toBeVisible()
        return tab
      }
      const participant = {
        name,
        page,
        close: () => context.close(),
        cut: async () => stub.cut(await token()),
        restore: async () => stub.restore(await token()),
        freeze: async () => stub.freeze(await token()),
        newTab
      }
      await page.goto(`/${room}`)
      // The lobby renders only once React mounts, so this is the mount.
      await expect(nameInput(page)).toBeVisible({ timeout: 15_000 })
      await nameInput(page).fill(name)
      await page.getByRole('button', { name: 'Join' }).click()
      // The room renders on the first SSE message, so the room view proves the stream arrived.
      await expect(page.getByRole('button', { name: 'Show votes' })).toBeVisible()
      return participant
    }
    await use(join)
    // A case may have closed one already; context.close() is idempotent.
    for (const close of closers) await close().catch(() => {})
  },

  // The captured output is the whole worker's, which is still the only place a config or
  // startup failure is visible.
  appLog: [
    async ({ app }, use, testInfo) => {
      await use()
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach('app.log', { body: app.output(), contentType: 'text/plain' })
      }
    },
    { auto: true }
  ]
})

// Step 8 revisits selectors, so these are as accessible as the page allows. The name inputs
// and the issue buttons have no label association and no accessible name at all.
export const nameInput = page =>
  page.locator('.form-group.row').filter({ hasText: 'User name' }).locator('input')
export const issueBox = page => page.getByPlaceholder('Current issue')
export const issueButton = page => page.locator('.input-group-append button')
export const summaryTable = page =>
  page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'Number of votes' }) })
export const participantRows = page =>
  page
    .locator('table')
    .filter({ has: page.getByRole('columnheader', { name: 'Voted' }) })
    .locator('tbody tr')
// not.toContainText needs exactly one match: zero fails as element(s) not found and two as a
// strict mode violation, so a row assertion cannot pass vacuously and needs no existence pin.
export const participantRow = (page, name) => participantRows(page).filter({ hasText: name })
// An empty <i> has no size, so count it rather than asking whether it is visible.
export const votedMark = row => row.locator('td').first().locator('svg, i')
// The withheld-value icon in the estimation cell, counted rather than asked about for the
// same reason as votedMark: an empty <i> has no size.
export const hiddenMark = row => row.locator('td').nth(2).locator('svg, i')
// The estimation cell's value div exists only while the round is revealed, so it is the one
// signal a reveal landed in a room where nobody has voted and the value is empty.
export const revealedCell = row => row.locator('td').nth(2).locator('div')
// Any alert, for asserting a reconnect cleared the banner: filtering by text would report
// hidden when it merely switched to the terminal "session has ended" message.
export const connectionAlert = page => page.getByRole('alert')
// The transient banner specifically, so a terminally dead session is not read as a blip.
export const connectionLost = page =>
  page.getByRole('alert').filter({ hasText: 'Connection to the room was lost' })
// Two renderings of one set, so a revealed round shows the same estimations in both. Compared as
// multisets: the order of a tie is undecided, and pinning it here would choose a rule nobody has.
export const expectSummaryMatchesTable = async page => {
  // Two empty renderings agree trivially, so this gate is what makes the comparison mean
  // anything, and being retrying it also settles the DOM before the reads below, which are not.
  await expect(summaryTable(page).locator('tbody tr')).not.toHaveCount(0)
  const tally = {}
  for (const row of await participantRows(page).all()) {
    const estimation = (await row.locator('td').nth(2).innerText()).trim()
    if (estimation !== '') tally[estimation] = (tally[estimation] || 0) + 1
  }
  const summary = []
  for (const row of await summaryTable(page).locator('tbody tr').all()) {
    const cells = await row.locator('td').allInnerTexts()
    // A third column would otherwise be dropped rather than compared.
    expect(cells).toHaveLength(2)
    const [value, count] = cells
    summary.push([value.trim(), Number(count.trim())])
  }
  expect(summary.sort()).toEqual(Object.entries(tally).sort())
}
// A card by its face value, for asserting its state rather than pressing it.
export const card = (page, value) => page.getByRole('button', { name: value, exact: true })
export const vote = (page, value) => card(page, value).click()
// The line under the deck that says why the cards are frozen, keyed on its text rather than its
// lock: it has text to key on, which is what votedMark and hiddenMark lack rather than share.
export const frozenNotice = page => page.getByText('The round is revealed')
// The recipient's own estimation, which is on the wire for them before any reveal.
export const ownEstimation = page => page.locator('.estimation-card .estimation-text')

// The legacy-link banner, a status rather than an alert so connectionAlert never sees it.
export const movedBanner = page => page.getByRole('status').filter({ hasText: 'old link' })

export { expect }
