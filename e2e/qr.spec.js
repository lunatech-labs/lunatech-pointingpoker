import { createRequire } from 'node:module'
import { test, expect, participantEntry, votedMark } from './fixtures.js'

test.use({ viewport: { width: 1280, height: 600 } })

const qrButton = page => page.getByRole('button', { name: 'QR code', exact: true })
const qrDialog = page => page.getByRole('dialog', { name: 'Scan to join' })
const qrCode = page => qrDialog(page).getByRole('img', { name: 'QR code of the room link' })
const closeButton = page => qrDialog(page).getByRole('button', { name: 'Close' })

const jsqrPath = createRequire(import.meta.url).resolve('jsqr')

// The code's element screenshot, drawn on a canvas in the page and read by jsQR.
const decode = async page => {
  await page.addScriptTag({ path: jsqrPath })
  const png = (await qrCode(page).screenshot()).toString('base64')
  return page.evaluate(async src => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + src
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const { data } = ctx.getImageData(0, 0, img.width, img.height)
    return window.jsQR(data, img.width, img.height)?.data
  }, png)
}

test('the dialog fits a laptop and its code scans to the room', async ({ join }) => {
  const { page } = await join('Alice')
  await expect(qrDialog(page)).toBeHidden()
  await qrButton(page).click()
  await expect(qrDialog(page)).toBeVisible()
  const fit = await qrDialog(page).evaluate(el => ({
    fitsY: el.scrollHeight <= el.clientHeight,
    fitsX: el.scrollWidth <= el.clientWidth,
    width: el.getBoundingClientRect().width,
    rem: parseFloat(getComputedStyle(document.documentElement).fontSize)
  }))
  expect(fit.fitsY).toBe(true)
  expect(fit.fitsX).toBe(true)
  expect(Math.abs(fit.width - 46 * fit.rem)).toBeLessThanOrEqual(0.5)
  expect(await decode(page)).toBe(page.url())
  await expect(qrDialog(page).getByText(page.url(), { exact: true })).toBeVisible()
})

const closers = {
  Close: page => closeButton(page).click(),
  Escape: page => page.keyboard.press('Escape'),
  'the backdrop': page => page.mouse.click(5, 5)
}
for (const [name, close] of Object.entries(closers)) {
  test(`${name} closes it`, async ({ join }) => {
    const { page } = await join('Alice')
    await qrButton(page).click()
    await expect(closeButton(page)).toBeFocused()
    await close(page)
    await expect(qrDialog(page)).toBeHidden()
    await expect(qrButton(page)).toBeFocused()
  })
}

// A held key repeats its click, which would press Close and then QR code again unguarded.
test('a held Enter opens it once', async ({ join }) => {
  const { page } = await join('Alice')
  await qrButton(page).focus()
  await page.keyboard.down('Enter')
  await page.keyboard.down('Enter')
  await page.keyboard.up('Enter')
  await expect(qrDialog(page)).toBeVisible()
  await expect(closeButton(page)).toBeFocused()
})

test('a vote while open leaves it open', async ({ join, voters }) => {
  const { page } = await join('Alice')
  const [bob] = await voters(['Bob'])
  await qrButton(page).click()
  await expect(qrDialog(page)).toBeVisible()
  await bob.vote('5')
  await expect(votedMark(participantEntry(page, 'Bob'))).toHaveCount(1)
  await expect(qrDialog(page)).toBeVisible()
  await expect(qrCode(page)).toBeVisible()
})
