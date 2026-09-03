import { test as base, expect } from '@playwright/test'
import { startApp } from '../testkit/app.js'
import { createStub } from '../testkit/stub.js'

// The page pulls four assets from three public hosts on every load, and a run opens roughly
// 55 contexts. Fetch each once per worker instead of once per context.
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|stackpath\.bootstrapcdn\.com)\//
// fetch decompresses the body, so relaying either of these alongside it corrupts the response.
const DROPPED = new Set(['content-encoding', 'content-length'])

export const test = base.extend({
  app: [
    async ({}, use) => {
      const app = await startApp()
      await use(app)
      await app.stop()
    },
    { scope: 'worker' }
  ],

  assets: [
    async ({}, use) => {
      const cache = new Map()
      const serve = async route => {
        const url = route.request().url()
        if (!cache.has(url)) {
          try {
            // Bounded, since a CDN that stalls rather than failing is the case this exists for.
            const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
            if (!response.ok) return route.continue()
            const headers = {}
            for (const [name, value] of response.headers) {
              if (!DROPPED.has(name)) headers[name] = value
            }
            cache.set(url, {
              status: response.status,
              headers,
              body: Buffer.from(await response.arrayBuffer())
            })
          } catch {
            // Any failure falls back to the network, which is what the page did before this.
            return route.continue()
          }
        }
        await route.fulfill(cache.get(url))
      }
      await use(serve)
    },
    { scope: 'worker' }
  ],

  context: async ({ context, assets }, use) => {
    await context.route(CDN, assets)
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
    if (!response.ok) throw new Error(`POST /create-room answered ${response.status}`)
    await use((await response.text()).trim())
  },

  // One browser context per participant: two pages in one context share the room cookie and
  // resolve to a single session, which is a step 6 case rather than any of these.
  join: async ({ browser, origin, room, stub, assets }, use) => {
    const open = []
    const join = async name => {
      const context = await browser.newContext({ baseURL: origin })
      await context.route(CDN, assets)
      const page = await context.newPage()
      await page.goto(`/${room}`)
      await nameInput(page).fill(name)
      await page.getByRole('button', { name: 'Join' }).click()
      // inRoom flips on the first SSE message, so the room view proves the stream arrived.
      await expect(page.getByRole('button', { name: 'Show votes' })).toBeVisible()
      const token = async () => {
        const cookie = (await context.cookies()).find(c => c.name === 'session')
        if (!cookie) throw new Error(`${name} has no session cookie`)
        return cookie.value
      }
      const participant = {
        name,
        page,
        close: () => context.close(),
        cut: async () => stub.cut(await token()),
        restore: async () => stub.restore(await token())
      }
      open.push(participant)
      return participant
    }
    await use(join)
    for (const participant of open) await participant.close().catch(() => {})
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
export const participantRow = (page, name) => participantRows(page).filter({ hasText: name })
// An empty <i> has no size, so count it rather than asking whether it is visible.
export const votedMark = row => row.locator('td').first().locator('svg, i')
// Any alert, for asserting a reconnect cleared the banner: filtering by text would report
// hidden when it merely switched to the terminal "session has ended" message.
export const connectionAlert = page => page.getByRole('alert')
// The transient banner specifically, so a terminally dead session is not read as a blip.
export const connectionLost = page =>
  page.getByRole('alert').filter({ hasText: 'Connection to the room was lost' })
export const vote = (page, value) =>
  page.getByRole('button', { name: value, exact: true }).click()

export { expect }
