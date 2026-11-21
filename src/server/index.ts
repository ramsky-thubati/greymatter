import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { openDb } from '../core/db.js'
import { createApp } from './app.js'
import { ProjectEvents } from './events.js'

const dbPath = process.env.DB_PATH ?? './data/greymatter.db'
mkdirSync(dirname(dbPath), { recursive: true })

const webDir = fileURLToPath(new URL('../web', import.meta.url))
const app = createApp(openDb(dbPath), new ProjectEvents(), existsSync(webDir) ? { staticDir: webDir } : {})
const port = Number(process.env.PORT ?? 4747)

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => {
  console.log(`greymatter listening on :${port}`)
})
