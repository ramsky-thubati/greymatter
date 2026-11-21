import { expect, test } from 'vitest'
import { openDb, tx } from '../../src/core/db.js'

test('nested tx joins the outer one and rolls back with it', () => {
  const db = openDb(':memory:')
  expect(() =>
    tx(db, () => {
      db.prepare("INSERT INTO projects (name, created_at) VALUES ('A', 'x')").run()
      tx(db, () => {
        db.prepare("INSERT INTO projects (name, created_at) VALUES ('B', 'x')").run()
        throw new Error('boom')
      })
    }),
  ).toThrow('boom')
  expect(db.prepare('SELECT COUNT(*) AS c FROM projects').get()).toEqual({ c: 0 })
})

test('nested tx commits with the outer one', () => {
  const db = openDb(':memory:')
  tx(db, () => tx(db, () => db.prepare("INSERT INTO projects (name, created_at) VALUES ('A', 'x')").run()))
  expect(db.prepare('SELECT COUNT(*) AS c FROM projects').get()).toEqual({ c: 1 })
})
