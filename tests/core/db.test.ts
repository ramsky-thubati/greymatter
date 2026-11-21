import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { BRANCH_COLORS } from '../../src/core/colors.js'
import { openDb, tx } from '../../src/core/db.js'

test('backfills colour on an old database', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'gm-')), 'old.db')
  const old = new DatabaseSync(file)
  old.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      next_task_num INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    CREATE TABLE branches (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL, purpose TEXT NOT NULL DEFAULT '', root_task_num INTEGER, created_at TEXT NOT NULL);`)
  old.exec("INSERT INTO projects (id, name, created_at) VALUES (1, 'A', 'x'), (2, 'B', 'x')")
  old.exec(`INSERT INTO branches (project_id, name, created_at) VALUES
    (1, 'a1', '1'), (2, 'b1', '1'), (1, 'a2', '2'), (2, 'b2', '2'), (2, 'b3', '3')`)
  old.close()
  const colours = (db: DatabaseSync, pid: number) =>
    (
      db.prepare('SELECT color FROM branches WHERE project_id = ? ORDER BY created_at, id').all(pid) as {
        color: string
      }[]
    ).map((r) => r.color)
  const db = openDb(file)
  expect(colours(db, 1)).toEqual(BRANCH_COLORS.slice(0, 2))
  expect(colours(db, 2)).toEqual(BRANCH_COLORS.slice(0, 3))
  db.prepare("UPDATE branches SET color = '#000000' WHERE name = 'a1'").run()
  db.close()
  const again = openDb(file)
  expect(colours(again, 1)[0]).toBe('#000000')
  again.close()
})

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
