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

// A new room on the app, checked, so a failed create fails here rather than at a later join.
export const createRoom = async baseUrl => {
  const response = await fetch(`${baseUrl}/create-room`, { method: 'POST' })
  if (!response.ok) {
    response.body?.cancel().catch(() => {})
    throw new Error(`POST /create-room answered ${response.status}`)
  }
  return (await response.text()).trim()
}

export const test = base.extend({
  // restart() keeps the port, so the worker's stub goes on pointing at the new process.
  app: [
    async ({}, use) => {
      let current = await startApp()
      await use({
        baseUrl: current.baseUrl,
        output: () => current.output(),
        restart: async (whileDown = async () => {}) => {
          await current.stop()
          await whileDown()
          current = await startApp({ port: current.port })
        }
      })
      await current.stop()
    },
    { scope: 'worker' }
  ],

  // Every context the suite opens goes through guard, here and in visitor, or a page could pass.
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
    await use(await createRoom(app.baseUrl))
  },

  // A page in its own guarded context, its localStorage seeded once, before its first goto.
  visitor: async ({ browser, origin, offOrigin }, use) => {
    const closers = []
    await use(async (storage = {}) => {
      const localStorage = Object.entries(storage).map(([name, value]) => ({ name, value }))
      const context = await browser.newContext({
        baseURL: origin,
        storageState: { cookies: [], origins: [{ origin, localStorage }] }
      })
      // Tracked before anything else can throw, so a half-built page is still torn down.
      closers.push(() => context.close())
      await guard(context, offOrigin)
      return context.newPage()
    })
    // A case may have closed one already; context.close() is idempotent.
    for (const close of closers) await close().catch(() => {})
  },

  // One browser context per participant: two pages in one context share the room cookie and
  // resolve to a single session, which is what newTab is for.
  join: async ({ visitor, room, stub }, use) => {
    // Each case starts from a first visit, so the role is chosen as the default role.
    const join = async (name, { initScript, role = 'Voter' } = {}) => {
      const page = await visitor()
      const context = page.context()
      // Before the first goto, and context init scripts run on every navigation.
      if (initScript) await context.addInitScript(initScript)
      const token = async () => {
        const cookie = (await context.cookies()).find(c => c.name === 'session')
        if (!cookie) throw new Error(`${name} has no session cookie`)
        return cookie.value
      }
      // A second page in the same context shares the room cookie, which is what makes two tabs
      // one participant. localStorage holds the name and the default role, so it joins at once.
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
      await defaultRoleRadio(page, role).check()
      await page.getByRole('button', { name: 'Join' }).click()
      // The room renders on the first SSE message, so the room view proves the stream arrived.
      await expect(page.getByRole('button', { name: 'Show votes' })).toBeVisible()
      return participant
    }
    await use(join)
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

// The test contract: roles, names, text and test ids only (ui refresh design, step 1).
export const nameInput = page => page.getByLabel('User name')
export const roomIdInput = page => page.getByLabel('Room id')
export const issueBox = page => page.getByRole('textbox', { name: 'Current issue' })
export const issueEdit = page => page.getByRole('button', { name: 'Edit issue' })
export const issueSave = page => page.getByRole('button', { name: 'Save issue' })
export const issueCancel = page => page.getByRole('button', { name: 'Cancel editing' })
export const results = page => page.getByRole('region', { name: 'Results' })
export const tallyEntries = page => results(page).getByTestId('tally-entry')
export const mostVoted = page => results(page).getByTestId('most-voted')
export const participantEntries = page =>
  page.getByRole('region', { name: 'Participants' }).getByTestId('participant')
// not.toContainText needs exactly one match: zero fails as element(s) not found and two as a
// strict mode violation, so an entry assertion cannot pass vacuously and needs no existence pin.
export const participantEntry = (page, name) => participantEntries(page).filter({ hasText: name })
export const votedMark = entry => entry.getByRole('img', { name: 'Voted' })
export const hiddenMark = entry => entry.getByRole('img', { name: 'Vote hidden' })
// Rendered only while the round is revealed, so it is the one signal a reveal landed in a room
// where nobody has voted and the value is empty.
export const revealedEstimation = entry => entry.getByTestId('participant-estimation')
// Any alert, for asserting a reconnect cleared the banner: filtering by text would report
// hidden when it merely switched to the "session has ended" message a refused page shows.
export const connectionAlert = page => page.getByRole('alert')
// The banner specifically, so a page that stopped at the ended-session message is not a blip.
export const connectionLost = page =>
  page.getByRole('alert').filter({ hasText: 'Connection to the room was lost' })
// Two renderings of one set, so a revealed round shows the same estimations in both. Compared as
// multisets: the order of a tie is undecided, and pinning it here would choose a rule nobody has.
export const expectSummaryMatchesParticipants = async page => {
  // Two empty renderings agree trivially, so this gate is what makes the comparison mean
  // anything, and being retrying it also settles the DOM before the reads below, which are not.
  await expect(tallyEntries(page)).not.toHaveCount(0)
  const tally = {}
  for (const entry of await participantEntries(page).all()) {
    const estimation = (await revealedEstimation(entry).innerText()).trim()
    if (estimation !== '') tally[estimation] = (tally[estimation] || 0) + 1
  }
  const summary = []
  for (const entry of await tallyEntries(page).all()) {
    const value = await entry.getByTestId('tally-value').innerText()
    const count = await entry.getByTestId('tally-count').innerText()
    summary.push([value.trim(), Number(count.trim())])
  }
  expect(summary.sort()).toEqual(Object.entries(tally).sort())
}
// A card by its face value, for asserting its state rather than pressing it.
export const card = (page, value) => page.getByRole('button', { name: value, exact: true })
export const deck = page => page.getByRole('group', { name: 'Estimation cards' })
export const vote = (page, value) => card(page, value).click()
// The line under the deck that says why the cards are frozen, keyed on its text rather than
// its lock icon.
export const frozenNotice = page => page.getByText('The round is revealed')
// The recipient's own confirmed estimation, read as the pressed card rather than the large one.
export const ownEstimation = page => deck(page).getByRole('button', { pressed: true })
// After a Re-vote the cast card is not pressed but keeps this description.
export const unconfirmedCard = page =>
  deck(page).getByRole('button', { description: 'Previous vote, not confirmed' })

// The lobby's default role: a radio group on every visit.
export const defaultRoleChoice = page => page.getByRole('group', { name: 'Your default role' })
export const defaultRoleRadio = (page, role) =>
  defaultRoleChoice(page).getByRole('radio', { name: role, exact: true })

// The role line's one button, named for the role it switches to: 'facilitator' or 'voter'.
export const switchTo = (page, role) => page.getByRole('button', { name: `Switch to ${role}` })
// What a facilitator's row shows in place of the voted mark.
export const facilitatorMark = entry => entry.getByText('Facilitator', { exact: true })

// The legacy-link banner, a status rather than an alert so connectionAlert never sees it.
export const movedBanner = page => page.getByRole('status').filter({ hasText: 'old link' })
// Shown after the reload on a refusal; a status for the same reason as movedBanner.
export const restartNotice = page => page.getByRole('status').filter({ hasText: 'Reconnected' })

// The issue editor's notices as a screen reader hears them: a role lookup skips a hidden region.
export const issueStatus = page => page.getByRole('status').and(page.getByTestId('issue-status'))

// A live region announces changes only to the element it is, so markRegion tags that element
// and expectLiveRegion fails once a re-render has replaced it or something silences it.
export const markRegion = region => region.evaluate(el => (el.__probe = 1))
// The values role="status" implies; each attribute may also be absent.
const implied = { 'aria-live': 'polite', 'aria-atomic': 'true', 'aria-busy': 'false' }
export const expectLiveRegion = async region => {
  const problems = await region.evaluate((el, implied) => {
    const read = (node, name) => node.getAttribute(name)?.trim().toLowerCase() ?? null
    const found = el.__probe === 1 ? [] : ['re-created since markRegion']
    for (const [name, value] of Object.entries(implied)) {
      if (![null, value].includes(read(el, name))) found.push(`${name}="${read(el, name)}"`)
    }
    const relevant = read(el, 'aria-relevant')
    const tokens = new Set(relevant?.split(/\s+/))
    if (relevant !== null && !(tokens.size === 2 && tokens.has('additions') && tokens.has('text')))
      found.push(`aria-relevant="${relevant}"`)
    for (let up = el.parentElement; up; up = up.parentElement) {
      if (read(up, 'aria-busy') === 'true') found.push(`aria-busy on <${up.localName}>`)
    }
    return found
  }, implied)
  expect(problems, 'what keeps the region from announcing').toEqual([])
}

export { expect }
