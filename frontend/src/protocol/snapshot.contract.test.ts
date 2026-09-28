import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { strictSnapshotSchema } from './snapshot'

// Written by SnapshotContractSpec through the production encoder; sbt test empties and refills it.
const dir = fileURLToPath(new URL('../../../target/contract/', import.meta.url))
const states = existsSync(dir) ? readdirSync(dir).filter(file => file.endsWith('.json')) : []

describe('the snapshot contract', () => {
  it('has server snapshots to check', () => {
    expect(states, `no snapshots in ${dir}: run sbt test first`).not.toHaveLength(0)
  })

  it.each(states)('parses %s with the strict schema', file => {
    const parsed = strictSnapshotSchema.safeParse(JSON.parse(readFileSync(dir + file, 'utf8')))
    expect(parsed.error?.issues ?? []).toEqual([])
  })
})
