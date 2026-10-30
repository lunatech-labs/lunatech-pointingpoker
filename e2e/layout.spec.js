import {
  test,
  expect,
  ESTIMATIONS,
  ISSUE_240,
  NAMES,
  copyHint,
  deck,
  expectLiveRegion,
  inRoom,
  issueText,
  markRegion,
  participantEntries,
  participantEntry,
  phaseLine,
  readBoxes,
  roundBar,
  roundSlot,
  setIssue,
  switchTo,
  table,
  tallyEntries,
  vote,
  votedMark
} from './fixtures.js'

// The floor and the comfort target of the wide layout (parent's step 4).
const floor = { width: 1280, height: 600 }
const comfort = { width: 1280, height: 680 }

// Two lines at 1280 px in both browsers, measured on room.html.
const TWO_LINES =
  'Rework the login page so that a returning user lands on their last room, and keep the room ' +
  'list in sync'
// The middle layout's two lines at 860 px, measured: TWO_LINES wraps to three below 1040.
const TWO_LINES_MIDDLE = TWO_LINES.slice(0, 66)
// Three of ISSUE_240, cut to 600.
const LONG = [ISSUE_240, ISSUE_240, ISSUE_240].join('. ').slice(0, 600)

// The voters besides the page, which is one of them on the voter's page.
const others = (role, count) => (role === 'Voter' ? count - 1 : count)

// One case per viewport and page, each viewport its own group so test.use can set it.
const ROLES = ['Voter', 'Facilitator']
const cases = (title, { viewports = [floor, comfort], roles = ROLES }, body) => {
  for (const viewport of viewports) {
    for (const role of roles) {
      test.describe(() => {
        test.use({ viewport })
        const size = `${viewport.width} by ${viewport.height}`
        test(`${title}, ${size}, on the ${role.toLowerCase()}'s page`, async ({
          join,
          voters,
          room
        }) => body({ join, voters, room, role, viewport }))
      })
    }
  }
}

const fill = async (join, voters, role, count) => {
  const { page } = await join('Alice', { role })
  const joined = others(role, count) ? await voters(NAMES.slice(0, others(role, count))) : []
  await expect(participantEntries(page)).toHaveCount(count)
  return { page, joined }
}

const grow = async (page, voters, role, from, to) => {
  await voters(NAMES.slice(others(role, from), others(role, to)))
  await expect(participantEntries(page)).toHaveCount(to)
}

// The premise of the floor's cases: the issue's heading is two of PP-1's lines tall.
const setTwoLines = async (page, text = TWO_LINES) => {
  await setIssue(page, 'PP-1')
  const one = (await readBoxes(page, { issue: issueText(page) })).boxes.issue.height
  await setIssue(page, text)
  const two = (await readBoxes(page, { issue: issueText(page) })).boxes.issue.height
  expect(Math.round(two / one), `${two} px over ${one} px`).toBe(2)
}

// Every voter but the last protocol voter, so the round stays open; the page's value is
// distinct below 14 voters.
const voteAllButOne = async (page, role, joined) => {
  if (role === 'Voter') await vote(page, ESTIMATIONS[joined.length % 13])
  await Promise.all(joined.slice(0, -1).map((voter, i) => voter.vote(ESTIMATIONS[i % 13])))
  await expect(votedMark(table(page))).toHaveCount((role === 'Voter' ? 1 : 0) + joined.length - 1)
}

const voteLast = async (page, role, joined) => {
  await joined.at(-1).vote(ESTIMATIONS[(joined.length - 1) % 13])
  await expect(phaseLine(page)).toHaveText('Revealed')
  const count = joined.length + (role === 'Voter' ? 1 : 0)
  await expect(tallyEntries(page)).toHaveCount(Math.min(count, 13))
}

// The page's parts; the facilitator's page has no slot while voting.
const parts = (page, slotShown) => ({
  header: page.getByRole('banner'),
  issue: issueText(page),
  ...(slotShown && { slot: roundSlot(page) }),
  bar: roundBar(page),
  table: table(page)
})

const entries = (page, count) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`entry ${i}`, participantEntries(page).nth(i)])
  )

// The first entry's width, which follows the entries' scale.
const firstWidth = async page =>
  (await readBoxes(page, { first: participantEntries(page).first() })).boxes.first.width

const within = (box, frame) =>
  box.x >= frame.x - 0.5 &&
  box.y >= frame.y - 0.5 &&
  box.x + box.width <= frame.x + frame.width + 0.5 &&
  box.y + box.height <= frame.y + frame.height + 0.5

// Each named box within the viewport, and within the table's box too when inTable says so.
const expectInView = (read, viewport, names, inTable = false) => {
  const frame = { x: 0, y: 0, ...viewport }
  const cut = names.filter(
    name =>
      !within(read.boxes[name], frame) || (inTable && !within(read.boxes[name], read.boxes.table))
  )
  expect(cut, JSON.stringify(read.boxes)).toEqual([])
}

// The boxes or fields of after that differ from before by more than half a pixel.
const moved = (before, after, fields = ['x', 'y', 'width', 'height']) =>
  Object.keys(before).flatMap(name =>
    fields
      .filter(field => Math.abs(after[name][field] - before[name][field]) > 0.5)
      .map(field => `${name}.${field}: ${before[name][field]} -> ${after[name][field]}`)
  )

const overlap = (a, b) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5 &&
  Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5

cases('no scroll at the floor', {}, async ({ join, voters, role, viewport }) => {
  const { page, joined } = await fill(join, voters, role, 14)
  await setTwoLines(page)
  await voteAllButOne(page, role, joined)
  const voting = await readBoxes(page, parts(page, role === 'Voter'))
  expect(voting.scrolls).toBe(0)
  expectInView(voting, viewport, Object.keys(voting.boxes))
  await voteLast(page, role, joined)
  const revealed = await readBoxes(page, parts(page, true))
  expect(revealed.scrolls).toBe(0)
  expectInView(revealed, viewport, Object.keys(revealed.boxes))
})

// The 4c1-wide plan's R6: a one-line issue, as 3b1 measured; with the two-line one the mockup
// itself clips 7 of 14.
cases(
  'every entry in view at the comfort target',
  { viewports: [comfort] },
  async ({ join, voters, role, viewport }) => {
    const { page, joined } = await fill(join, voters, role, 14)
    await setIssue(page, 'PP-1')
    const read = () => readBoxes(page, { table: table(page), ...entries(page, 14) })
    await voteAllButOne(page, role, joined)
    const voting = await read()
    expectInView(voting, viewport, Object.keys(entries(page, 14)), true)
    await voteLast(page, role, joined)
    const revealed = await read()
    expectInView(revealed, viewport, Object.keys(entries(page, 14)), true)
  }
)

// The table keeps its 5 rem, and the slot and the round bar scroll wholly into view.
const scrollsAndCutsNothing = async (page, viewport, slotShown) => {
  const read = await readBoxes(page, parts(page, slotShown))
  expect(read.boxes.table.height).toBeGreaterThanOrEqual(5 * read.rem - 0.5)
  expect(read.scrolls).toBeGreaterThan(0)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const scrolled = await readBoxes(page, parts(page, slotShown))
  expectInView(scrolled, viewport, slotShown ? ['slot', 'bar'] : ['bar'])
  // In the slot's place, the table's top.
  if (!slotShown) expect(scrolled.boxes.table.y).toBeGreaterThanOrEqual(0)
}

cases(
  'a longer issue scrolls the page and cuts nothing',
  { viewports: [floor] },
  async ({ join, voters, role, viewport }) => {
    const { page, joined } = await fill(join, voters, role, 14)
    await setIssue(page, LONG)
    await voteAllButOne(page, role, joined)
    await scrollsAndCutsNothing(page, viewport, role === 'Voter')
    await voteLast(page, role, joined)
    await scrollsAndCutsNothing(page, viewport, true)
  }
)

cases(
  'a window below the floor scrolls the page and cuts nothing',
  { viewports: [{ width: 1280, height: 450 }] },
  async ({ join, voters, role, viewport }) => {
    const { page, joined } = await fill(join, voters, role, 14)
    await setTwoLines(page)
    await voteAllButOne(page, role, joined)
    await scrollsAndCutsNothing(page, viewport, role === 'Voter')
    await voteLast(page, role, joined)
    await scrollsAndCutsNothing(page, viewport, true)
  }
)

// The 4c1-wide plan's R10: a room of 4 fits above 1 and below the cap at the floor, so a dropped
// reserve shows.
cases("the entries' scale holds through a reveal", {}, async ({ join, voters, role }) => {
  const { page, joined } = await fill(join, voters, role, 4)
  await voteAllButOne(page, role, joined)
  const voting = await firstWidth(page)
  await voteLast(page, role, joined)
  const revealed = await firstWidth(page)
  expect(Math.abs(revealed - voting), `voting at ${voting} px`).toBeLessThanOrEqual(0.5)
})

// The entries' scale as their list carries it, read without waiting for the fonts.
const scale = page =>
  table(page)
    .getByRole('list')
    .evaluate(list => parseFloat(list.style.getPropertyValue('--s')))

cases(
  'a shorter window refits the entries',
  { viewports: [{ width: 1280, height: 1000 }] },
  async ({ join, voters, role }) => {
    const { page } = await fill(join, voters, role, 14)
    // The fit runs in the observer's callback, a frame after the 14th entry lands.
    await page.evaluate(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    )
    const tall = await scale(page)
    const short = { width: 1280, height: 680 }
    await page.setViewportSize(short)
    await expect.poll(() => scale(page), `from ${tall}`).toBeLessThan(tall)
    const read = await readBoxes(page, { table: table(page), ...entries(page, 14) })
    expectInView(read, short, Object.keys(entries(page, 14)), true)
  }
)

cases('a room of 1 is drawn larger than a room of 14', {}, async ({ join, voters, role }) => {
  const { page } = await fill(join, voters, role, 1)
  const alone = await firstWidth(page)
  await grow(page, voters, role, 1, 14)
  expect(alone).toBeGreaterThan((await firstWidth(page)) + 1)
})

cases("an entry's card never passes a deck card's height", {}, async ({ join, voters, role }) => {
  const { page } = await fill(join, voters, role, 1)
  const read = await readBoxes(page, { card: participantEntries(page).first().getByRole('img') })
  expect(read.boxes.card.height).toBeLessThanOrEqual(5.5 * read.rem + 0.5)
})

// Records every uncaught error from before the page's first script.
const heardErrors = () => {
  window.heardErrors = []
  window.addEventListener('error', event => window.heardErrors.push(event.message))
}

cases(
  'a room of 0 voters is fitted',
  { roles: ['Facilitator'] },
  async ({ join, role }) => {
    // A throw in the first fit, the observer's first callback, comes before join returns.
    const { page } = await join('Alice', { role, initScript: heardErrors })
    await expect(table(page).getByRole('heading', { name: 'Voters · 0' })).toBeVisible()
    await readBoxes(page, { table: table(page) })
    await expect(inRoom(page)).toBeVisible()
    expect(await page.evaluate(() => window.heardErrors)).toEqual([])
  }
)

// Its text and tally stay with 'a Show in a room where nobody voted renders no summary'.
cases(
  'nobody voted: the slot keeps its height through a reveal',
  {},
  async ({ join, voters, role }) => {
    const { page } = await fill(join, voters, role, 14)
    const voter = role === 'Voter'
    const watched = voter ? { slot: roundSlot(page) } : { bar: roundBar(page), table: table(page) }
    const read = () => readBoxes(page, watched)
    const before = await read()
    await page.getByRole('button', { name: 'Show votes' }).click()
    await expect(phaseLine(page)).toHaveText('Revealed')
    await expect(roundSlot(page)).toContainText('Nobody voted')
    const after = await read()
    if (voter) expect(moved(before.boxes, after.boxes, ['height'])).toEqual([])
    else {
      expect(moved({ bar: before.boxes.bar }, after.boxes)).toEqual([])
      expect(moved({ table: before.boxes.table }, after.boxes, ['y'])).toEqual([])
    }
  }
)

cases(
  'nothing moves between a room of 2 and a room of 14',
  {},
  async ({ join, voters, role }) => {
    const { page } = await fill(join, voters, role, 2)
    const voter = role === 'Voter'
    const watched = {
      header: page.getByRole('banner'),
      issue: issueText(page),
      bar: roundBar(page),
      ...(voter ? { slot: roundSlot(page) } : { table: table(page) })
    }
    const { table: top, ...two } = (await readBoxes(page, watched)).boxes
    await grow(page, voters, role, 2, 14)
    const fourteen = (await readBoxes(page, watched)).boxes
    expect(moved(two, fourteen)).toEqual([])
    // In the slot's place, the table's top.
    if (!voter) expect(moved({ table: top }, fourteen, ['y'])).toEqual([])
  }
)

cases(
  'the phase line keeps its box through a reveal, a Re-vote and a vote',
  {},
  async ({ join, voters, role }) => {
    const { page, joined } = await fill(join, voters, role, 14)
    const read = async () => (await readBoxes(page, { phase: phaseLine(page) })).boxes
    await voteAllButOne(page, role, joined)
    const before = await read()
    await voteLast(page, role, joined)
    expect(moved(before, await read()), 'revealed').toEqual([])
    await page.getByRole('button', { name: 'Re-vote' }).click()
    await expect(phaseLine(page)).toHaveText('Voting')
    expect(moved(before, await read()), 'after Re-vote').toEqual([])
    await joined[0].vote(ESTIMATIONS[0])
    await expect(votedMark(table(page))).toHaveCount(1)
    expect(moved(before, await read()), 'after a vote').toEqual([])
  }
)

// On the real clock, since a fake one stops readBoxes' frames; the hint is read around the boxes.
cases(
  'a copy moves and covers nothing in the header or the round',
  {},
  async ({ join, voters, role, room }) => {
    const { page } = await fill(join, voters, role, 1)
    await expect(copyHint(page)).toHaveText('')
    await markRegion(copyHint(page))
    const copy = page.getByRole('link', { name: 'Copy link' })
    const named = {
      id: page.getByRole('heading', { name: room, exact: true }),
      copy,
      switch: switchTo(page, role === 'Voter' ? 'facilitator' : 'voter'),
      leave: page.getByRole('link', { name: 'Leave' }),
      phase: phaseLine(page),
      bar: roundBar(page),
      ...(role === 'Voter' && { slot: roundSlot(page) })
    }
    const before = (await readBoxes(page, named)).boxes
    await copy.click()
    await expect(copyHint(page)).toHaveText('Link copied')
    const { hint, ...after } = (await readBoxes(page, { ...named, hint: copyHint(page) })).boxes
    await expect(copyHint(page)).toHaveText('Link copied')
    expect(moved(before, after)).toEqual([])
    const covered = Object.keys(after).filter(name => overlap(hint, after[name]))
    expect(covered, JSON.stringify({ hint, ...after })).toEqual([])
    await expectLiveRegion(copyHint(page))
  }
)

// Two names that wrap, which the rows' balance moves into different rows at this height.
const WRAPPING = ['Bruno', 'Camille', 'Damien', 'Elodie', 'Fabien', 'Jean-Baptiste Delacroix',
  'Julien', 'Laura', 'Lucas', 'Marie-Christine Lefebvre', 'Nicolas', 'Pauline', 'Thomas']

cases(
  'two wrapping names in different rows keep every entry in view',
  { viewports: [{ width: 1280, height: 1000 }] },
  async ({ join, voters, role, viewport }) => {
    const { page } = await join('Alice', { role })
    // Agnes takes Alice's place in the table on the facilitator's page.
    await voters(role === 'Voter' ? WRAPPING : ['Agnes', ...WRAPPING])
    await expect(participantEntries(page)).toHaveCount(14)
    const inView = async () => {
      const read = await readBoxes(page, {
        table: table(page),
        jean: participantEntry(page, 'Jean-Baptiste'),
        marie: participantEntry(page, 'Marie-Christine'),
        ...entries(page, 14)
      })
      expect(read.boxes.jean.y, 'the wrapping names share a row').not.toBe(read.boxes.marie.y)
      expectInView(read, viewport, Object.keys(entries(page, 14)), true)
    }
    await inView()
    // The facilitator's table gives up its reserve to the slot here.
    await page.getByRole('button', { name: 'Show votes' }).click()
    await expect(phaseLine(page)).toHaveText('Revealed')
    await inView()
  }
)

// The journeys' protocol voters: NAMES without Bob, who facilitates.
const OTHERS = NAMES.filter(name => name !== 'Bob')

// Alice's voter page and Bob's facilitator page, with count entries in all.
const journeyRoom = async (join, voters, count) => {
  const alice = await join('Alice')
  const bob = await join('Bob', { role: 'Facilitator' })
  const joined = await voters(OTHERS.slice(0, count - 1))
  for (const { page } of [alice, bob]) {
    await expect(participantEntries(page), `a room of ${count}`).toHaveCount(count)
  }
  return { alice, bob, joined }
}

// A reveal where nobody voted, then Re-vote; the facilitator's page has no slot while voting.
const nobodyVoted = async (alice, bob) => {
  const slot = async () => (await readBoxes(alice.page, { slot: roundSlot(alice.page) })).boxes
  const voting = await slot()
  await bob.page.getByRole('button', { name: 'Show votes' }).click()
  for (const { page } of [alice, bob]) {
    await expect(phaseLine(page), 'nobody voted: revealed').toHaveText('Revealed')
    await expect(roundSlot(page), 'nobody voted: shown').toContainText('Nobody voted')
  }
  const revealed = await slot()
  expect(moved(voting, revealed, ['height']), "nobody voted: the slot's height").toEqual([])
  await bob.page.getByRole('button', { name: 'Re-vote' }).click()
  for (const { page } of [alice, bob]) {
    await expect(phaseLine(page), 'nobody voted: voting again').toHaveText('Voting')
  }
}

test.describe('the narrow layouts', () => {
  test.skip(({ browserName }) => browserName !== 'chromium')

  test.describe(() => {
    const viewport = { width: 860, height: 600 }
    test.use({ viewport })

    // The stops run as 1, 5, 2, 3, 4 and 6, so stop 5 reveals the fresh round.
    test('the middle layout, 860 by 600, on both pages', async ({ join, voters }) => {
      const { alice, bob, joined } = await journeyRoom(join, voters, 2)
      const pages = [alice.page, bob.page]
      await setTwoLines(alice.page, TWO_LINES_MIDDLE)
      await expect(issueText(bob.page), "Bob's issue").toHaveText(TWO_LINES_MIDDLE)

      // Stop 1; in the slot's place on Bob's page, the table's top.
      const watched = page => ({
        header: page.getByRole('banner'),
        issue: issueText(page),
        bar: roundBar(page),
        ...(page === alice.page ? { slot: roundSlot(page) } : { table: table(page) })
      })
      const two = []
      for (const page of pages) two.push((await readBoxes(page, watched(page))).boxes)
      joined.push(...(await voters(OTHERS.slice(1))))
      for (const [i, page] of pages.entries()) {
        await expect(participantEntries(page), 'a room of 14').toHaveCount(14)
        const fourteen = (await readBoxes(page, watched(page))).boxes
        const { table: top, ...fixed } = two[i]
        expect(moved(fixed, fourteen), 'nothing moves from 2 to 14').toEqual([])
        if (top) expect(moved({ table: top }, fourteen, ['y']), "the table's top").toEqual([])
      }

      await nobodyVoted(alice, bob)

      // Stop 2: 13 distinct values, the last protocol voter's missing so the round stays open.
      await vote(alice.page, ESTIMATIONS[12])
      await Promise.all(joined.slice(0, 12).map((voter, i) => voter.vote(ESTIMATIONS[i])))
      await expect(votedMark(table(bob.page)), '13 votes').toHaveCount(13)
      const cards = Object.fromEntries(
        ESTIMATIONS.map((_, i) => [`card ${i}`, deck(alice.page).getByRole('button').nth(i)])
      )
      for (const page of pages) {
        const voter = page === alice.page
        const read = await readBoxes(page, { ...parts(page, voter), ...(voter && cards) })
        expect(read.scrolls, 'no scroll while voting').toBe(0)
        expectInView(read, viewport, Object.keys(parts(page, voter)))
        if (voter) {
          const out = Object.keys(cards).filter(name => !within(read.boxes[name], read.boxes.slot))
          expect(out, `the deck within the slot, ${JSON.stringify(read.boxes)}`).toEqual([])
        }
      }

      // Stop 3
      await bob.page.getByRole('button', { name: 'Show votes' }).click()
      for (const page of pages) {
        await expect(tallyEntries(page), 'the tally of 13').toHaveCount(13)
        const read = await readBoxes(page, parts(page, true))
        expect(read.scrolls, 'no scroll once revealed').toBe(0)
        const show = page.getByRole('button', { name: 'Show votes' })
        await expect(show, 'no Show votes once revealed').toHaveCount(0)
      }

      // Stop 4: each row, whether it holds a facilitator.
      for (const page of pages) {
        const rows = page.getByRole('complementary', { name: 'Participants' }).getByRole('listitem')
        await expect(rows, 'the roster').toHaveCount(15)
        const flags = []
        for (const row of await rows.all()) {
          flags.push((await row.getByTestId('facilitator').count()) > 0)
        }
        const last = [...Array(14).fill(false), true]
        expect(flags, 'the facilitators after every voter').toEqual(last)
      }

      // Stop 6, revealed
      await setIssue(alice.page, LONG)
      await expect(issueText(bob.page), "Bob's issue").toHaveText(LONG)
      for (const page of pages) await scrollsAndCutsNothing(page, viewport, true)
    })
  })
})
