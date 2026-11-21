import { beforeAll, describe, expect, test } from 'vitest'
import { type Db, openDb } from '../../src/core/db.js'
import { DomainError } from '../../src/core/errors.js'
import { createProject } from '../../src/core/projects.js'
import { createCheckpoint, getLiveSummary, listSummaryVersions, updateLiveSummary } from '../../src/core/summary.js'
import { maxSeq } from './helpers.js'

const md = '# Engine\n\n```ts\nconst a = `x`\n```\n\nMounts done ✅\n\n'

let db: Db
let p: { id: number; name: string }

beforeAll(() => {
  db = openDb(':memory:')
  p = createProject(db, 'A')
})

describe('summary', () => {
  test('summary round-trips exactly', () => {
    updateLiveSummary(db, p.id, md)
    expect(getLiveSummary(db, p.id)).toEqual({ version: 1, body: md })
  })

  test('checkpoint freezes v1 and starts v2 as an exact copy at the end of the sequence', () => {
    const cp = createCheckpoint(db, p.id)
    expect(cp).toMatchObject({ fromVersion: 1, toVersion: 2 })
    expect(getLiveSummary(db, p.id)).toEqual({ version: 2, body: md })
    expect(listSummaryVersions(db, p.id)[1]).toMatchObject({ version: 1, body: md, frozenAt: expect.any(String) })
    expect(cp.seq).toBe(maxSeq(db, p.id))
  })

  test('updates after a checkpoint only touch the live version', () => {
    updateLiveSummary(db, p.id, 'short')
    expect(listSummaryVersions(db, p.id).map((v) => v.body)).toEqual(['short', md])
  })

  test('unknown project is not_found', () => {
    expect(() => getLiveSummary(db, 999)).toThrow(DomainError)
    expect(() => createCheckpoint(db, 999)).toThrow(DomainError)
  })
})
