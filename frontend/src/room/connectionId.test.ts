import { afterEach, describe, expect, it, vi } from 'vitest'
import { mintConnectionId } from './connectionId'

const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('mintConnectionId', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('mints a version 4 UUID', () => {
    expect(mintConnectionId()).toMatch(v4)
  })

  // A page over plain HTTP is not a secure context, so randomUUID is missing there.
  it('mints a version 4 UUID without crypto.randomUUID', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => real.getRandomValues(a) })
    const ids = Array.from({ length: 50 }, mintConnectionId)
    ids.forEach(id => expect(id).toMatch(v4))
    expect(new Set(ids).size).toBe(50)
  })
})
