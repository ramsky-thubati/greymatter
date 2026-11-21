import { createRequire } from 'node:module'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createApiClient } from './api-client.js'
import { INSTRUCTIONS } from './instructions.js'
import { registerTools } from './tools.js'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const server = new McpServer({ name: 'greymatter', version }, { instructions: INSTRUCTIONS })
registerTools(server, createApiClient(process.env.GREYMATTER_URL ?? 'http://127.0.0.1:4747'))
await server.connect(new StdioServerTransport())
