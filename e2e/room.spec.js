import {
  test,
  expect,
  connectionAlert,
  connectionLost,
  participantEntry,
  participantEntries,
  card,
  deck,
  expectSummaryMatchesParticipants,
  phaseLine,
  revealedEstimation,
  results,
  tallyEntries,
  issueBox,
  issueText,
  issueCancel,
  issueSave,
  issueStatus,
  markRegion,
  expectLiveRegion,
  issueEdit,
  inRoom,
  copyHint,
  votedMark,
  keptMark,
  vote,
  ownEstimation,
  restartNotice,
  unconfirmedCard
} from './fixtures.js'

test('two browsers exchange votes', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  await expect(participantEntry(alice.page, 'Bob')).toHaveCount(1)

  await vote(alice.page, '5')
  const aliceOnBob = participantEntry(bob.page, 'Alice')
  await expect(votedMark(aliceOnBob)).toHaveCount(1)
  // The vote is marked but the value is withheld until the round is revealed.
  await expect(aliceOnBob).not.toContainText('5')

  await vote(bob.page, '3')
  // Everyone having voted reveals the round with nobody pressing Show.
  for (const participant of [alice, bob]) {
    await expect(results(participant.page)).toBeVisible()
    await expect(participantEntry(participant.page, 'Alice')).toContainText('5')
    await expect(participantEntry(participant.page, 'Bob')).toContainText('3')
  }
})

test('a straggler keeps the votes hidden until Show is pressed', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await vote(alice.page, '5')
  await expect(votedMark(participantEntry(bob.page, 'Alice'))).toHaveCount(1)
  await expect(results(bob.page)).toBeHidden()

  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(results(bob.page)).toBeVisible()
  await expect(participantEntry(bob.page, 'Alice')).toContainText('5')
})

test('a cast vote is withheld, shown on the reveal, and withheld again on a re-vote', async ({
  join
}) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await vote(alice.page, '5')
  const aliceOnBob = participantEntry(bob.page, 'Alice')
  await expect(votedMark(aliceOnBob)).toHaveCount(1)
  await expect(aliceOnBob).not.toContainText('5')

  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(aliceOnBob).toContainText('5')

  // The mark clearing proves the re-vote reached Bob: the value goes back behind the marker while
  // the entry still has one, which showUserEstimation reading voted would lose.
  await alice.page.getByRole('button', { name: 'Re-vote' }).click()
  await expect(votedMark(aliceOnBob)).toHaveCount(0)
  await expect(keptMark(aliceOnBob)).toHaveCount(1)
  await expect(aliceOnBob).not.toContainText('5')
})

test('the participant list follows a join and a leave', async ({ join }) => {
  const alice = await join('Alice')
  await expect(participantEntries(alice.page)).toHaveCount(1)

  const bob = await join('Bob')
  await expect(participantEntries(alice.page)).toHaveCount(2)
  await expect(participantEntries(bob.page)).toHaveCount(2)

  // No grace period and no traffic to force detection: the leave endpoint removes the member
  // on the request, so the default timeout is the whole budget.
  await bob.page.getByRole('link', { name: 'Leave' }).click()
  await expect(participantEntry(alice.page, 'Bob')).toHaveCount(0)
  await expect(participantEntries(alice.page)).toHaveCount(1)
})

// Ids are random, so without the sort four names come out in this order one run in 24.
// The names need the accent, case and numeric rules, so each browser's collator is exercised.
test('participants are listed in name order', async ({ join }) => {
  const first = await join('Dev 10')
  await join('Dev 2')
  await join('bob')
  await join('Ålice')
  // An array checks the count as well, so this cannot read before Ålice arrives.
  await expect(participantEntries(first.page)).toHaveText([/Ålice/, /bob/, /Dev 2/, /Dev 10/])
})

// Plain HTTP off localhost is not a secure context, and randomUUID is undefined there.
test('a page without crypto.randomUUID still joins and leaves', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob', { initScript: () => delete Crypto.prototype.randomUUID })
  await expect(participantEntries(alice.page)).toHaveCount(2)
  // The leave names the fallback's id, so a malformed one would draw a 400 and leave Bob listed.
  await bob.page.getByRole('link', { name: 'Leave' }).click()
  await expect(participantEntry(alice.page, 'Bob')).toHaveCount(0)
})

test('the issue is text until Edit issue is pressed', async ({ join }) => {
  const alice = await join('Alice')

  await expect(issueBox(alice.page)).toHaveCount(0)
  await expect(issueText(alice.page)).toHaveText('No issue yet')
  await issueEdit(alice.page).click()
  await expect(issueBox(alice.page)).toBeEditable()
  await expect(issueBox(alice.page)).toBeFocused()

  // The caret starts at the end of a stored issue.
  await issueCancel(alice.page).click()
  await setIssue(alice, 'alpha beta')
  await expect(issueText(alice.page)).toHaveText('alpha beta')
  await issueEdit(alice.page).click()
  await expect(issueBox(alice.page)).toBeFocused()
  const caret = f => [f.selectionStart, f.selectionEnd]
  expect(await issueBox(alice.page).evaluate(caret)).toEqual([10, 10])
})

// Carol departs while Bob is cut, and Bob is back before his own removal fires. Alice learns it
// from a live broadcast once the grace period expires, Bob only from his reconnect snapshot.
async function departureWhileCut(join) {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const carol = await join('Carol')
  // Both, and not just one: Bob must have seen Carol for the case to mean anything, and Alice
  // must have too or her removal assertion below passes on someone she never had.
  await expect(participantEntries(bob.page)).toHaveCount(3)
  await expect(participantEntries(alice.page)).toHaveCount(3)

  await carol.close()
  // Two broadcasts are what make the app notice Carol, and both must be seen reaching Bob
  // before he is cut, or his own removal starts on the same clock as Carol's.
  const aliceOnBob = participantEntry(bob.page, 'Alice')
  await vote(alice.page, '5')
  await expect(votedMark(aliceOnBob)).toHaveCount(1)
  await setIssue(alice, 'PP-1')
  await expect(issueText(bob.page)).toHaveText('PP-1')

  await bob.cut()
  await expect(connectionLost(bob.page)).toBeVisible()

  await expect(participantEntry(alice.page, 'Carol')).toHaveCount(0, { timeout: 20_000 })
  await bob.restore()
  await expect(connectionAlert(bob.page)).toBeHidden({ timeout: 10_000 })
  return { alice, bob }
}

test('a Show survives someone joining', async ({ join }) => {
  const alice = await join('Alice')
  await join('Bob')

  await vote(alice.page, '5')
  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(results(alice.page)).toBeVisible()

  await join('Carol')
  // Carol's entry proves the join was processed, and the un-reveal happens in the same handler.
  await expect(participantEntry(alice.page, 'Carol')).toHaveCount(1)
  await expect(results(alice.page)).toBeVisible({ timeout: 2000 })
})

test('an auto-revealed round stays revealed when a straggler arrives', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await vote(alice.page, '5')
  await vote(bob.page, '3')
  await expect(results(alice.page)).toBeVisible()

  await join('Carol')
  await expect(participantEntry(alice.page, 'Carol')).toHaveCount(1)
  await expect(results(alice.page)).toBeVisible({ timeout: 2000 })
})

test('a revealed round takes no more votes until Re-vote', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await vote(alice.page, '5')
  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(results(alice.page)).toBeVisible()

  // Bob never voted, so this covers a first vote as well as Alice changing hers.
  await expect(deck(alice.page)).toHaveCount(0)
  await expect(deck(bob.page)).toHaveCount(0)
  await expect(phaseLine(bob.page)).toHaveText('Revealed')

  await alice.page.getByRole('button', { name: 'Re-vote' }).click()
  // Alice's mark clearing on Bob's page is the proof the re-vote reached him, not just her.
  await expect(votedMark(participantEntry(bob.page, 'Alice'))).toHaveCount(0)
  await expect(phaseLine(bob.page)).toHaveText('Voting')

  await vote(bob.page, '3')
  await expect(votedMark(participantEntry(alice.page, 'Bob'))).toHaveCount(1)
})

test('a reveal with no vote moves no entry', async ({ join }) => {
  const alice = await join('Alice')
  // Layout f puts the table above the slot, so a move here comes from above it or the scale.
  const top = async () => (await participantEntries(alice.page).first().boundingBox()).y

  // Nobody votes, so the reveal only turns each mark into its "–" face, of the same size.
  const before = await top()
  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(phaseLine(alice.page)).toHaveText('Revealed')
  await expect(alice.page.getByRole('button', { name: 'Re-vote' })).toBeVisible()
  expect(await top()).toEqual(before)
})

// A reset has to re-arm the latch, and the two reach it from different state: reVote keeps the
// estimations, clear wipes them. Shared so the pair cannot drift apart.
async function resetReArmsTheAutoReveal(join, reset) {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await vote(alice.page, '5')
  await vote(bob.page, '3')
  // The latch firing on a fresh round, which is the state the reset below undoes.
  await expect(results(alice.page)).toBeVisible()

  await reset(alice)
  await expect(results(bob.page)).toBeHidden()
  await expect(votedMark(participantEntry(bob.page, 'Alice'))).toHaveCount(0)

  await vote(alice.page, '8')
  // Half the room: still hidden, so the reveal below is the latch and not a stale summary.
  await expect(results(bob.page)).toBeHidden()
  await vote(bob.page, '8')

  // No Show anywhere in this case: the last vote is what reveals the round.
  await expect(results(alice.page)).toBeVisible()
  await expect(tallyEntries(alice.page)).toHaveCount(1)
  await expectSummaryMatchesParticipants(alice.page)
}

test('a re-vote re-arms the auto-reveal, and the last vote fires it', async ({ join }) => {
  await resetReArmsTheAutoReveal(join, alice =>
    alice.page.getByRole('button', { name: 'Re-vote' }).click()
  )
})

test('a clear re-arms the auto-reveal, and the last vote fires it', async ({ join }) => {
  await resetReArmsTheAutoReveal(join, alice =>
    alice.page.getByRole('button', { name: 'Clear votes' }).click()
  )
})

// Carol never votes and then leaves, which a re-derived everyone-has-voted predicate would
// answer by revealing the room. Shared so the two departure modes cannot drift apart.
async function stragglerDepartsWithVotesHidden(join, depart, prunedRoster) {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const carol = await join('Carol')
  // Everyone must have seen all three, or the removal assertion below passes on an entry that
  // was never rendered.
  for (const page of [alice.page, bob.page]) {
    await expect(participantEntries(page)).toHaveCount(3)
  }

  await vote(alice.page, '5')
  await vote(bob.page, '3')
  await expect(results(alice.page)).toBeHidden()

  await depart(carol, alice)

  // Two commits stand in for the heartbeat 15s away: a dead stream shows only on a failed
  // write. Edits, not votes, since a vote after the prune could reveal the round legitimately.
  for (const issue of ['PP-1', 'PP-2']) {
    await setIssue(alice, issue)
    // Bob's issue is the proof the publish went out, and therefore that Carol was written to.
    await expect(issueText(bob.page)).toHaveText(issue)
  }

  // What the pruned roster looks like differs by departure mode, so each case brings its own.
  await prunedRoster(alice)

  // Both remaining members have voted, reached by a departure rather than by a vote, so the
  // latch must leave the room hidden.
  for (const page of [alice.page, bob.page]) {
    await expect(results(page)).toBeHidden()
  }
  await expect(participantEntry(alice.page, 'Bob')).not.toContainText('3')
  await expect(participantEntry(bob.page, 'Alice')).not.toContainText('5')
  await expect(votedMark(participantEntry(alice.page, 'Bob'))).toHaveCount(1)
}

test('a straggler closing their tab leaves the votes hidden', async ({ join }) => {
  await stragglerDepartsWithVotesHidden(
    join,
    carol => carol.close(),
    // 25s: if detection ever fell back to a 15s heartbeat the removal would land at about
    // 20.1s, just outside a tighter cap, and the beacon leaves no cut whose budget a wait spends.
    alice => expect(participantEntry(alice.page, 'Carol')).toHaveCount(0, { timeout: 25_000 })
  )
})

test('a straggler reloading leaves the votes hidden', async ({ join }) => {
  // Hostile now: the beacon removes Carol on the reload, so the latch is the only thing
  // keeping the round shut until she returns.
  await stragglerDepartsWithVotesHidden(
    join,
    // The room's path joins with the remembered name, and /join resolves the cookie rather than
    // minting, so the reload returns the same Carol instead of a second one.
    async (carol, alice) => {
      await carol.page.reload()
      // Her own list is empty until the snapshot lands, so this is what proves the rejoin
      // finished. A minted second id would render four entries here.
      await expect(participantEntries(carol.page)).toHaveCount(3)
      await expect(participantEntry(alice.page, 'Carol')).toHaveCount(1)
      await expect(participantEntries(alice.page)).toHaveCount(3)
    },
    // Carol already rejoined above, so this only confirms the departure left no stale entry.
    alice => expect(participantEntry(alice.page, 'Carol')).toHaveCount(1)
  )
})

test('two tabs on one room are one participant', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const second = await bob.newTab()
  await expect(participantEntries(alice.page)).toHaveCount(2)

  await vote(second, '5')
  // One identity, one vote: the first tab sees its own estimation arrive from the second.
  await expect(ownEstimation(bob.page)).toHaveText('5')
  await expect(participantEntries(alice.page)).toHaveCount(2)

  await second.close()
  // The surviving tab keeps the member: only its own ref went. Alice's vote reveals the round,
  // so her value is what reaches the surviving tab.
  await vote(alice.page, '3')
  await expect(revealedEstimation(participantEntry(bob.page, 'Alice'))).toHaveText('3')
  await expect(participantEntry(alice.page, 'Bob')).toHaveCount(1)
})

test('a reload keeps its identity and its vote', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await vote(bob.page, '8')
  await expect(votedMark(participantEntry(alice.page, 'Bob'))).toHaveCount(1)

  await bob.page.reload()
  await expect(inRoom(bob.page)).toBeVisible()

  // One Bob, not two, and the estimation came back with him rather than being recast.
  await expect(participantEntry(alice.page, 'Bob')).toHaveCount(1, { timeout: 10_000 })
  await expect(participantEntries(alice.page)).toHaveCount(2)
  await expect(ownEstimation(bob.page)).toHaveText('8')
})

test('the tally counts only the votes that were cast', async ({ join }) => {
  const alice = await join('Alice')
  await join('Bob')

  await vote(alice.page, '5')
  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(results(alice.page)).toBeVisible()

  // Before step 3 Bob's empty estimation was an entry of its own, and could out-count a real one.
  await expect(tallyEntries(alice.page)).toHaveCount(1, { timeout: 2000 })
  await expectSummaryMatchesParticipants(alice.page)
})

test('a Show during a re-vote still tallies the estimations it shows', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await vote(alice.page, '3')
  await vote(bob.page, '5')
  await expect(results(alice.page)).toBeVisible()

  await alice.page.getByRole('button', { name: 'Re-vote' }).click()
  // Hidden again is the proof the re-vote landed before the Show below.
  await expect(results(alice.page)).toBeHidden()

  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  // A re-vote keeps the estimations and only clears confirmation, so the list shows both.
  // The summary sits beside that list and has to count what it displays.
  await expect(participantEntry(alice.page, 'Bob')).toContainText('5')
  await expect(tallyEntries(alice.page)).toHaveCount(2)
  await expectSummaryMatchesParticipants(alice.page)
})

test('an empty estimation posted directly is refused, not stored as an empty vote', async ({
  join,
  room
}) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await vote(alice.page, '5')
  // Refused at the edge now: a tapir validator answers 400 before the room sees the request,
  // and the actor's own guard stays behind it as insurance.
  const posted = await bob.page.request.post(`/rooms/${room}/vote`, { data: { estimation: '' } })
  expect(posted.status()).toBe(400)

  // Bob never voted, so the round stays hidden until Show is pressed.
  await expect(votedMark(participantEntry(alice.page, 'Bob'))).toHaveCount(0)
  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(revealedEstimation(participantEntry(alice.page, 'Bob'))).toHaveCount(1)
  await expect(tallyEntries(alice.page)).toHaveCount(1, { timeout: 2000 })
  await expectSummaryMatchesParticipants(alice.page)
})

test('a Show in a room where nobody voted renders no summary', async ({ join }) => {
  const alice = await join('Alice')
  await join('Bob')

  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  // The reveal has to be shown to have landed, or the assertion below passes on a snapshot that
  // never arrived. Without Result's fallback for an empty tally the render aborts, so this fails.
  await expect(revealedEstimation(participantEntry(alice.page, 'Bob'))).toHaveCount(1)
  // No entry rather than no region, so a region saying nobody voted still passes.
  await expect(tallyEntries(alice.page)).toHaveCount(0)
  await expect(results(alice.page)).toContainText('Nobody voted')
})

test('no duplicate participants after a reconnect', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await bob.cut()
  await expect(connectionLost(bob.page)).toBeVisible()
  await bob.restore()
  // The banner clears on reopen, so its absence is the reconnect, retryable rather than timed.
  await expect(connectionAlert(bob.page)).toBeHidden({ timeout: 10_000 })

  // A vote landing on Bob's page proves his stream came back usable: the banner clearing above
  // is only onopen firing, and says nothing about whether frames still arrive.
  await vote(alice.page, '5')
  await expect(votedMark(participantEntry(bob.page, 'Alice').first())).toHaveCount(1, {
    timeout: 10_000
  })

  await expect(participantEntries(bob.page)).toHaveCount(2, { timeout: 2000 })
  await expect(participantEntries(alice.page)).toHaveCount(2, { timeout: 2000 })
})

test('a participant who departed during the gap is pruned on reconnect', async ({ join }) => {
  const { bob } = await departureWhileCut(join)

  await expect(participantEntry(bob.page, 'Carol')).toHaveCount(0, { timeout: 2000 })
})

test('a vote survives its own reconnect', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await vote(bob.page, '8')
  await expect(votedMark(participantEntry(alice.page, 'Bob'))).toHaveCount(1)

  await bob.cut()
  await expect(connectionLost(bob.page)).toBeVisible()
  await bob.restore()
  await expect(connectionAlert(bob.page)).toBeHidden({ timeout: 10_000 })

  // The room's own state, not Bob's stale copy: Alice never disconnected, and her vote reveals
  // the round, so Bob's value on her page comes from a snapshot published after the reconnect.
  await vote(alice.page, '5')
  await expect(revealedEstimation(participantEntry(alice.page, 'Bob'))).toHaveText('8', {
    timeout: 10_000
  })
})

test('a disconnection outlasting the grace period comes back without a reload', async ({
  join
}) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  // A refused stream would also come back, through the reload, so this mark is what fails it.
  await bob.page.evaluate(() => (window.sameLoad = true))

  await bob.cut()
  await expect(connectionLost(bob.page)).toBeVisible()
  // Detection rides on the room's own traffic, so two writes to Bob's dead stream start his
  // grace period; both are asserted on Alice's page, since Bob's page is stale while cut.
  const aliceOnAlice = participantEntry(alice.page, 'Alice')
  await vote(alice.page, '5')
  await expect(votedMark(aliceOnAlice)).toHaveCount(1)
  await vote(alice.page, '8')
  await expect(ownEstimation(alice.page)).toHaveText('8')
  // Bob's own entry going is the grace period expiring, which is what this case needs and what
  // departureWhileCut's reconnect stays inside: restoring sooner would prove nothing.
  await expect(participantEntry(alice.page, 'Bob')).toHaveCount(0, { timeout: 20_000 })

  await bob.restore()
  // Any alert, not just the banner: a page that stopped at the "session has ended" message
  // shows an alert too, and would pass a filtered assertion.
  await expect(connectionAlert(bob.page)).toBeHidden({ timeout: 10_000 })

  // Bob is back and not duplicated. Identity reuse is not observable here, since his entry
  // was already gone: RoomSpec's grace-expiry resolve case is what pins the id.
  await expect(participantEntry(alice.page, 'Bob')).toHaveCount(1, { timeout: 10_000 })
  await expect(participantEntries(bob.page)).toHaveCount(2, { timeout: 10_000 })

  // A frame arriving after the reconnect, since the alert clearing is only onopen firing.
  await setIssue(alice, 'PP-1')
  await expect(issueText(bob.page)).toHaveText('PP-1', { timeout: 10_000 })
  expect(await bob.page.evaluate(() => window.sameLoad)).toBe(true)
  await expect(restartNotice(bob.page)).toHaveCount(0)
})

test('a stream frozen without an error is noticed and reopened on its own', async ({ join }) => {
  // The heartbeat is fixed at 15 s, so noticing takes 35 to 40 s of silence.
  test.setTimeout(90_000)
  const alice = await join('Alice')
  // Recorded as it happens, since the banner lasts only until the reopened stream's onopen.
  const bob = await join('Bob', {
    initScript: () =>
      new MutationObserver(() => {
        const alert = document.querySelector('[role="alert"]')
        if (alert?.textContent?.includes('was lost')) window.bannerSeen = true
      }).observe(document, { childList: true, subtree: true, characterData: true })
  })

  await bob.freeze()
  await vote(alice.page, '5')
  await expect(votedMark(participantEntry(alice.page, 'Alice'))).toHaveCount(1)
  await expect
    .poll(() => bob.page.evaluate(() => window.bannerSeen === true), { timeout: 45_000 })
    .toBe(true)

  // The reopened stream's first snapshot, then a frame sent after it.
  await expect(votedMark(participantEntry(bob.page, 'Alice'))).toHaveCount(1)
  await setIssue(alice, 'PP-1')
  await expect(issueText(bob.page)).toHaveText('PP-1')
})

test('a draft survives blur and room activity', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await issueEdit(alice.page).click()
  await issueBox(alice.page).fill('Alice is still typing')

  // Any publish carries the issue, so a vote by anyone would clobber an unguarded box.
  await vote(bob.page, '5')
  // Require the snapshot to have landed: toHaveValue passes on its first poll otherwise.
  await expect(votedMark(participantEntry(alice.page, 'Bob'))).toHaveCount(1)
  await expect(issueBox(alice.page)).toHaveValue('Alice is still typing')

  // Edit mode, not focus, guards the draft, so alt-tabbing away to copy a title loses nothing.
  await issueBox(alice.page).blur()
  // A join, since Carol's entry only appears once the frame lands.
  await join('Carol')
  await expect(participantEntry(alice.page, 'Carol')).toHaveCount(1)
  await expect(issueBox(alice.page)).toHaveValue('Alice is still typing')
})

test('an edit committed with the Save issue button reaches the other browser', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await issueEdit(alice.page).click()
  await issueBox(alice.page).fill('PP-42')
  await issueSave(alice.page).click()

  await expect(issueText(bob.page)).toHaveText('PP-42')
  await expect(issueText(alice.page)).toHaveText('PP-42')

  // Alice's own saved text cannot distinguish an applied snapshot from a blocked one, so
  // move the room past it and require her to follow.
  await setIssue(bob, 'PP-43')
  await expect(issueText(alice.page)).toHaveText('PP-43')
})

test('a commit that never blurred the box still lets the room resync it', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await issueEdit(alice.page).click()
  await issueBox(alice.page).fill('PP-42')
  // Stands in for macOS, where clicking a button moves no focus: dispatchEvent carries no
  // mousedown, so the box keeps focus through the save, which must not hold the room off.
  await issueSave(alice.page).dispatchEvent('click')
  // Proves the commit posted, so a failure below is the editor and not a dead synthetic click.
  await expect(issueText(bob.page)).toHaveText('PP-42')

  await setIssue(bob, 'PP-43')
  await expect(issueText(alice.page)).toHaveText('PP-43')
})

// Sets the room's issue from one browser; the caller waits for whatever proves it landed.
async function setIssue(member, issue) {
  await issueEdit(member.page).click()
  await issueBox(member.page).fill(issue)
  await issueSave(member.page).click()
}

const conflictNotice = page => page.getByText('Changed by someone else to:')

test('Enter saves and Escape cancels', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  // iOS shows no keyboard for focus that lands on a readonly input, so record readOnly then.
  // Edit takes focus at the press, before the field mounts, so the field's first focus counts.
  await alice.page.evaluate(() =>
    document.addEventListener('focusin', ({ target }) => {
      if ('readOnly' in target) document.body.dataset.readOnlyAtFocus ??= String(target.readOnly)
    })
  )
  await issueEdit(alice.page).click()
  await expect(alice.page.locator('body')).toHaveAttribute('data-read-only-at-focus', 'false')
  // Edit issue focuses the box, so the keys work without clicking into it first.
  await alice.page.keyboard.type('PP-7')
  // An input method's Enter confirms its composition and must not save the draft.
  await issueBox(alice.page).dispatchEvent('keydown', { key: 'Enter', isComposing: true })
  // Safari ends the composition before that Enter's keydown, which reports keyCode 229.
  await issueBox(alice.page).dispatchEvent('keydown', { key: 'Enter', keyCode: 229 })
  await expect(issueBox(alice.page)).toBeEditable()
  await alice.page.keyboard.press('Enter')
  await expect(issueText(bob.page)).toHaveText('PP-7')
  await expect(issueBox(alice.page)).toHaveCount(0)
  await expect(issueText(alice.page)).toHaveText('PP-7')

  await issueEdit(alice.page).click()
  await issueBox(alice.page).fill('scrapped')
  await alice.page.keyboard.press('Escape')
  await expect(issueBox(alice.page)).toHaveCount(0)
  await expect(issueText(alice.page)).toHaveText('PP-7')
})

test("cancel drops the draft for the room's issue", async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  await setIssue(bob, 'PP-1')
  await expect(issueText(alice.page)).toHaveText('PP-1')

  await issueEdit(alice.page).click()
  await issueBox(alice.page).fill('scrapped')
  await setIssue(bob, 'PP-2')
  await expect(conflictNotice(alice.page)).toBeVisible()
  await issueCancel(alice.page).click()

  await expect(issueText(alice.page)).toHaveText('PP-2')
  await expect(issueEdit(alice.page)).toBeVisible()
})

test('a concurrent change shows the notice, and Use theirs takes it', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await issueEdit(alice.page).click()
  await issueBox(alice.page).fill('mine')
  await setIssue(bob, 'PP-2')

  await expect(conflictNotice(alice.page)).toHaveText(/Changed by someone else to: "PP-2"/)
  await expect(issueBox(alice.page)).toHaveValue('mine')
  await alice.page.getByRole('button', { name: 'Use theirs' }).click()
  await expect(issueBox(alice.page)).toHaveValue('PP-2')
  await expect(conflictNotice(alice.page)).toHaveCount(0)
  await expect(issueBox(alice.page)).toHaveJSProperty('readOnly', false)
  // The link-button leaves with the notice, so the box takes focus back for Enter and Escape.
  await expect(issueBox(alice.page)).toBeFocused()
})

test('saving over a concurrent change replaces it', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await issueEdit(alice.page).click()
  await issueBox(alice.page).fill('mine')
  await setIssue(bob, 'PP-2')
  await expect(conflictNotice(alice.page)).toBeVisible()

  await issueSave(alice.page).click()
  await expect(issueText(bob.page)).toHaveText('mine')
  await expect(issueText(alice.page)).toHaveText('mine')
  await expect(conflictNotice(alice.page)).toHaveCount(0)
})

test('a double-clicked Save issue posts once', async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const posts = []
  alice.page.on('request', request => {
    if (request.url().endsWith(`/rooms/${room}/edit-issue`)) posts.push(request.postData())
  })

  await issueEdit(alice.page).click()
  await issueBox(alice.page).fill('mine')
  await issueSave(alice.page).dblclick()
  await expect(issueText(bob.page)).toHaveText('mine')
  // A second POST would follow the first within a round trip; Bob's vote is a later frame.
  await vote(bob.page, '5')
  await expect(votedMark(participantEntry(alice.page, 'Bob'))).toHaveCount(1)
  expect(posts).toHaveLength(1)
})

test('a save the network drops keeps the draft and says so', async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const editIssue = new RegExp(`/rooms/${room}/edit-issue$`)
  await alice.page.route(editIssue, route => route.abort())

  await issueEdit(alice.page).click()
  await issueBox(alice.page).fill('mine')
  await issueSave(alice.page).click()
  await expect(alice.page.getByText('Could not save the issue')).toBeVisible()
  await expect(issueBox(alice.page)).toHaveValue('mine')
  await expect(issueBox(alice.page)).toHaveJSProperty('readOnly', false)

  // Save issue keeps focus through the failure, so the failure is read from it and Enter retries.
  await expect(issueSave(alice.page)).toBeFocused()
  await alice.page.unroute(editIssue)
  await alice.page.keyboard.press('Enter')
  await expect(issueText(bob.page)).toHaveText('mine')
  await expect(alice.page.getByText('Could not save the issue')).toHaveCount(0)
})

test('a failed save leaves focus the user moved elsewhere', async ({ join, room }) => {
  const alice = await join('Alice')
  let release
  const stalled = new Promise(resolve => (release = resolve))
  await alice.page.route(new RegExp(`/rooms/${room}/edit-issue$`), async route => {
    await stalled
    await route.abort()
  })

  await setIssue(alice, 'mine')
  const elsewhere = card(alice.page, '5')
  await elsewhere.focus()
  release()
  await expect(alice.page.getByText('Could not save the issue')).toBeVisible()
  await expect(elsewhere).toBeFocused()
})

test('a failed save with focus fallen puts focus in the field', async ({ join, room }) => {
  const alice = await join('Alice')
  let release
  const stalled = new Promise(resolve => (release = resolve))
  await alice.page.route(new RegExp(`/rooms/${room}/edit-issue$`), async route => {
    await stalled
    await route.abort()
  })

  await setIssue(alice, 'mine')
  await expect(issueSave(alice.page)).toBeFocused()
  await alice.page.evaluate(() => document.activeElement.blur())
  await expect(alice.page.locator('body')).toBeFocused()
  release()
  await expect(alice.page.getByText('Could not save the issue')).toBeVisible()
  await expect(issueBox(alice.page)).toBeFocused()
})

// The issue saves a page sends; read only once a later frame has landed.
const issueSaves = (page, room) => {
  const sent = []
  page.on('request', request => {
    if (request.url().endsWith(`/rooms/${room}/edit-issue`)) sent.push(request.postData())
  })
  return sent
}

// Holds every issue save in flight until the returned release is called.
const holdSaves = async (page, room) => {
  let release
  const held = new Promise(resolve => (release = resolve))
  await page.route(new RegExp(`/rooms/${room}/edit-issue$`), async route => {
    await held
    await route.continue()
  })
  return release
}

// By the time the voter's vote shows on the watcher's page, an earlier press has sent its request.
const laterVote = async (voter, watcher) => {
  await vote(voter.page, '5')
  await expect(votedMark(participantEntry(watcher.page, voter.name))).toHaveCount(1)
}

test('a mouse save keeps focus on Save issue, and presses on it or Cancel mid-save do nothing', async ({
  join,
  room
}) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const saves = issueSaves(alice.page, room)
  const release = await holdSaves(alice.page, room)

  await issueEdit(alice.page).click()
  await issueBox(alice.page).fill('mine')
  await issueSave(alice.page).click()
  await expect(issueSave(alice.page)).toHaveAttribute('aria-disabled', 'true')
  await expect(issueSave(alice.page)).toBeFocused()
  await expect(issueBox(alice.page)).toHaveJSProperty('readOnly', true)
  const looks = el =>
    el.evaluate(node => {
      const style = getComputedStyle(node)
      return {
        color: style.color,
        background: style.backgroundColor,
        border: style.borderTopColor
      }
    })
  const save = await looks(issueSave(alice.page))
  const cancel = await looks(issueCancel(alice.page))
  const probe = await alice.page.evaluate(() => {
    const span = document.createElement('span')
    span.style.color = 'var(--grey)'
    span.style.backgroundColor = 'var(--paper-pale)'
    document.body.append(span)
    const style = getComputedStyle(span)
    const read = { color: style.color, background: style.backgroundColor }
    span.remove()
    return read
  })
  expect(save).toEqual(cancel)
  expect([save.color, save.background]).toEqual([probe.color, probe.background])

  // Forced, since a plain click waits while the button is aria-disabled.
  await issueSave(alice.page).click({ force: true })
  await issueCancel(alice.page).click({ force: true })
  await expect(issueCancel(alice.page)).toBeFocused()
  await expect(issueEdit(alice.page)).toHaveCount(0)
  await expect(issueBox(alice.page)).toHaveValue('mine')
  await expect(issueBox(alice.page)).toHaveJSProperty('readOnly', true)

  release()
  await expect(issueText(bob.page)).toHaveText('mine')
  await laterVote(bob, alice)
  expect(saves).toHaveLength(1)
})

test('Escape, Cancel and a save each end with focus on Edit issue', async ({ join }) => {
  const alice = await join('Alice')

  await issueEdit(alice.page).click()
  await alice.page.keyboard.press('Escape')
  await expect(issueEdit(alice.page)).toBeFocused()

  await issueEdit(alice.page).click()
  await issueCancel(alice.page).click()
  await expect(issueEdit(alice.page)).toBeFocused()

  // Save issue unmounts with the save, which would drop focus to the page.
  await setIssue(alice, 'PP-1')
  await expect(issueEdit(alice.page)).toBeFocused()
})

test('focus moved elsewhere during a save stays there after it succeeds', async ({
  join,
  room
}) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const release = await holdSaves(alice.page, room)

  await setIssue(alice, 'mine')
  const elsewhere = card(alice.page, '5')
  await elsewhere.focus()
  release()
  await expect(issueText(bob.page)).toHaveText('mine')
  // The close's effect has run by a later frame, so a focus it moved would show.
  await laterVote(bob, alice)
  await expect(elsewhere).toBeFocused()
})

test('a page load leaves focus off Edit issue', async ({ join }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')

  await laterVote(bob, alice)
  await expect(issueEdit(alice.page)).not.toBeFocused()
})

// Cancel editing takes Edit issue's place, under the second click.
test('a double-click on Edit issue leaves the editor open, focus in the field', async ({
  join
}) => {
  const alice = await join('Alice')

  await issueEdit(alice.page).dblclick()
  await expect(issueCancel(alice.page)).toBeVisible()
  await expect(issueBox(alice.page)).toBeFocused()
  await expect(issueBox(alice.page)).toHaveJSProperty('readOnly', false)

  // A double-click in the field still selects a word, so only buttons lose the second press.
  await issueBox(alice.page).fill('alpha beta')
  const spot = await issueBox(alice.page).evaluate(f => ({
    x: parseFloat(getComputedStyle(f).paddingLeft) + 4,
    y: f.clientHeight / 2
  }))
  await issueBox(alice.page).dblclick({ position: spot })
  const word = f => f.value.slice(f.selectionStart, f.selectionEnd).trim()
  expect(await issueBox(alice.page).evaluate(word)).toBe('alpha')
  await expect(issueCancel(alice.page)).toBeVisible()
  await expect(issueBox(alice.page)).toHaveJSProperty('readOnly', false)
})

test('a held Enter in the field saves once and leaves the editor closed', async ({
  join,
  room
}) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const saves = issueSaves(alice.page, room)

  await issueEdit(alice.page).click()
  await issueBox(alice.page).fill('PP-1')
  await alice.page.keyboard.down('Enter')
  await expect(issueText(bob.page)).toHaveText('PP-1')
  await expect(issueEdit(alice.page)).toBeFocused()
  // A down without an up is a repeat, sent where it could reopen the editor.
  await alice.page.keyboard.down('Enter')
  await alice.page.keyboard.down('Enter')
  await alice.page.keyboard.up('Enter')
  await laterVote(bob, alice)
  await expect(issueEdit(alice.page)).toBeVisible()
  expect(saves).toHaveLength(1)
})

test('a held Enter on Edit issue opens the editor and saves nothing', async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const saves = issueSaves(alice.page, room)

  await issueEdit(alice.page).focus()
  await alice.page.keyboard.down('Enter')
  await expect(issueBox(alice.page)).toBeFocused()
  // Sent once the field has focus, where a repeat would save the unchanged text.
  await alice.page.keyboard.down('Enter')
  await alice.page.keyboard.down('Enter')
  await alice.page.keyboard.up('Enter')
  await laterVote(bob, alice)
  await expect(issueBox(alice.page)).toHaveJSProperty('readOnly', false)
  expect(saves).toHaveLength(0)
})

test('a held Enter in the field while saves fail sends one request', async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const saves = issueSaves(alice.page, room)
  await alice.page.route(new RegExp(`/rooms/${room}/edit-issue$`), route => route.abort())

  await issueEdit(alice.page).click()
  await issueBox(alice.page).fill('mine')
  await alice.page.keyboard.down('Enter')
  await expect(alice.page.getByText('Could not save the issue')).toBeVisible()
  await expect(issueBox(alice.page)).toBeFocused()
  await issueBox(alice.page).evaluate(f => f.setSelectionRange(2, 2))
  // Sent after the failure, where each repeat would retry.
  await alice.page.keyboard.down('Enter')
  await alice.page.keyboard.down('Enter')
  await alice.page.keyboard.up('Enter')
  await laterVote(bob, alice)
  await expect(issueBox(alice.page)).toHaveValue('mine')
  expect(saves).toHaveLength(1)
})

// Read by its own text throughout, since a region's text is announced as a whole.
test("the editor's notices are announced from one live region", async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const status = issueStatus(alice.page)
  const conflict = 'Changed by someone else to: "PP-2" Use theirs'
  const failure = 'Could not save the issue'
  await expect(status).toBeAttached()
  await expect(status).toBeEmpty()
  await markRegion(status)

  await issueEdit(alice.page).click()
  await issueBox(alice.page).fill('mine')
  await setIssue(bob, 'PP-2')
  await expect(status).toHaveText(conflict)
  await expectLiveRegion(status)

  const editIssue = new RegExp(`/rooms/${room}/edit-issue$`)
  await alice.page.route(editIssue, route => route.abort())
  await issueSave(alice.page).click()
  await expect(status).toHaveText(failure + conflict)
  await expectLiveRegion(status)

  await alice.page.getByRole('button', { name: 'Use theirs' }).click()
  await expect(status).toHaveText(failure)
  await expectLiveRegion(status)

  await alice.page.unroute(editIssue)
  await alice.page.keyboard.press('Enter')
  await expect(issueEdit(alice.page)).toBeVisible()
  await expect(status).toBeEmpty()
  await expectLiveRegion(status)
})

test('a re-vote leaves the caster shown as selected but unconfirmed', async ({ join }) => {
  const alice = await join('Alice')
  // Bob keeps the round open, so Alice's card is read while voting: a revealed round has no deck.
  await join('Bob')
  const selected = ownEstimation(alice.page)
  const unconfirmed = unconfirmedCard(alice.page)

  await vote(alice.page, '5')
  await expect(selected).toHaveText('5')
  await expect(unconfirmed).toHaveCount(0)
  // The role filter pressed: false would also match a card with no aria-pressed at all.
  await expect(card(alice.page, '3')).toHaveAttribute('aria-pressed', 'false')

  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await alice.page.getByRole('button', { name: 'Re-vote' }).click()
  // reVote clears voted and keeps estimation, which is the only state this description means.
  await expect(unconfirmed).toHaveText('5')
  await expect(selected).toHaveCount(0)

  await alice.page.getByRole('button', { name: 'Clear votes' }).click()
  await expect(unconfirmed).toHaveCount(0)
})

// The server's re-vote has no guard, so one click during voting would unconfirm every vote.
test('Re-vote is offered only while the round is revealed', async ({ join }) => {
  const alice = await join('Alice')
  await join('Bob')
  const reVote = alice.page.getByRole('button', { name: 'Re-vote' })

  await vote(alice.page, '5')
  await expect(ownEstimation(alice.page)).toHaveText('5')
  await expect(reVote).toHaveCount(0)
  await alice.page.getByRole('button', { name: 'Show votes' }).click()
  await expect(reVote).toBeVisible()
  await alice.page.getByRole('button', { name: 'Clear votes' }).click()
  await expect(reVote).toHaveCount(0)
})

// The round bar's toggle: Show votes while voting, Re-vote while revealed, one element.
const toggle = page => page.getByRole('button', { name: /^(Show votes|Re-vote)$/ })

// The round commands a page sends, in order; read only once a later snapshot has landed.
const commandsSent = (page, room) => {
  const sent = []
  const command = new RegExp(`/rooms/${room}/(show|revote|clear)$`)
  page.on('request', request => {
    const match = request.url().match(command)
    if (match) sent.push(match[1])
  })
  return sent
}

// By the time this shows on the other page, a press made before it would have sent its request.
const laterSnapshot = async (from, to, issue) => {
  await setIssue(from, issue)
  await expect(issueText(to.page)).toHaveText(issue)
}

// Both clicks usually land before the flip, so only the detail rule drops the second.
test('a double-click sends one request', async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const sent = commandsSent(alice.page, room)

  await toggle(alice.page).dblclick()
  await expect(toggle(alice.page)).toHaveText('Re-vote')
  await laterSnapshot(bob, alice, 'PP-1')
  expect(sent).toEqual(['show'])
})

test('a held Enter fires once, and focus stays on the toggle across the flip', async ({
  join,
  room
}) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const sent = commandsSent(alice.page, room)

  await toggle(alice.page).focus()
  await alice.page.keyboard.down('Enter')
  await expect(toggle(alice.page)).toHaveText('Re-vote')
  await expect(toggle(alice.page)).toBeFocused()
  // Past the guard, so only the Enter rule drops them; a down without an up is a repeat.
  await expect(toggle(alice.page)).not.toHaveAttribute('aria-disabled')
  await alice.page.keyboard.down('Enter')
  await alice.page.keyboard.down('Enter')
  await alice.page.keyboard.up('Enter')
  await laterSnapshot(bob, alice, 'PP-1')
  expect(sent).toEqual(['show'])
})

test('a forced single press just after a flip sends nothing, and one after the 1 s acts', async ({
  join,
  room
}) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const sent = commandsSent(alice.page, room)

  await toggle(alice.page).click()
  await expect(toggle(alice.page)).toHaveText('Re-vote')
  // Forced, since a plain click waits while the button is aria-disabled.
  await toggle(alice.page).click({ force: true })
  await laterSnapshot(bob, alice, 'PP-1')
  expect(sent).toEqual(['show'])

  await expect(toggle(alice.page)).not.toHaveAttribute('aria-disabled')
  await toggle(alice.page).click({ force: true })
  await expect(toggle(alice.page)).toHaveText('Show votes')
  expect(sent).toEqual(['show', 'revote'])
})

test("someone else's Show guards my bar", async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const sent = commandsSent(alice.page, room)

  await toggle(bob.page).click()
  await expect(toggle(alice.page)).toHaveText('Re-vote')
  await toggle(alice.page).click({ force: true })
  await alice.page.getByRole('button', { name: 'Clear votes' }).click({ force: true })
  await laterSnapshot(bob, alice, 'PP-1')
  expect(sent).toEqual([])
})

// On a paused clock, so both bounds are exact rather than raced.
test('a second flip restarts the guard', async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const sent = commandsSent(alice.page, room)
  await alice.page.clock.install()
  await alice.page.clock.pauseAt(Date.now() + 2000)

  await toggle(alice.page).click()
  await expect(toggle(alice.page)).toHaveText('Re-vote')
  await alice.page.clock.runFor(700)
  // Straight to the API: every bar is guarded, so a second flip comes from outside them.
  expect((await bob.page.request.post(`/rooms/${room}/revote`)).ok()).toBe(true)
  await expect(toggle(alice.page)).toHaveText('Show votes')
  await alice.page.clock.runFor(999)
  await toggle(alice.page).click({ force: true })
  await laterSnapshot(bob, alice, 'PP-1')
  expect(sent).toEqual(['show'])
  await alice.page.clock.runFor(1)
  await toggle(alice.page).click({ force: true })
  await expect(toggle(alice.page)).toHaveText('Re-vote')
  expect(sent).toEqual(['show', 'show'])
})

test('a Clear while voting starts no guard', async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const sent = commandsSent(alice.page, room)

  await vote(bob.page, '5')
  await expect(votedMark(participantEntry(alice.page, 'Bob'))).toHaveCount(1)
  await alice.page.getByRole('button', { name: 'Clear votes' }).click()
  await expect(votedMark(participantEntry(alice.page, 'Bob'))).toHaveCount(0)
  await toggle(alice.page).click({ force: true })
  await expect(toggle(alice.page)).toHaveText('Re-vote')
  expect(sent).toEqual(['clear', 'show'])
})

test('the first snapshot mounts the bar unguarded', async ({ join, room }) => {
  const alice = await join('Alice')
  const sent = commandsSent(alice.page, room)

  await toggle(alice.page).click({ force: true })
  await expect(toggle(alice.page)).toHaveText('Re-vote')
  expect(sent).toEqual(['show'])
})

// On a paused clock, so both bounds are exact rather than raced.
test('the guard lasts 1 s from the flip', async ({ join, room }) => {
  const alice = await join('Alice')
  const bob = await join('Bob')
  const sent = commandsSent(alice.page, room)
  await alice.page.clock.install()
  await alice.page.clock.pauseAt(Date.now() + 2000)

  await toggle(alice.page).click()
  await expect(toggle(alice.page)).toHaveText('Re-vote')
  await alice.page.clock.runFor(999)
  // A snapshot without a flip, which must neither end nor restart the guard.
  await laterSnapshot(bob, alice, 'PP-1')
  await toggle(alice.page).click({ force: true })
  await laterSnapshot(bob, alice, 'PP-2')
  expect(sent).toEqual(['show'])
  await alice.page.clock.runFor(1)
  await toggle(alice.page).click({ force: true })
  await expect(toggle(alice.page)).toHaveText('Show votes')
  expect(sent).toEqual(['show', 'revote'])
})

test('the copy hint lasts 2 s from the first copy, not the last', async ({ join }) => {
  const alice = await join('Alice')
  const page = alice.page
  const copy = page.getByRole('link', { name: 'Copy link' })
  // Paused just after real time: the tick's heartbeat was heard on the real clock.
  await page.clock.install()
  await page.clock.pauseAt(Date.now() + 2000)

  await copy.click()
  await expect(copyHint(page)).toHaveText('Link copied')
  await page.clock.runFor(1500)
  await copy.click()
  await expect(copyHint(page)).toHaveText('Link copied')
  await page.clock.runFor(490)
  await expect(copyHint(page)).toHaveText('Link copied')
  await page.clock.runFor(10)
  await expect(copyHint(page)).toBeEmpty()
})
