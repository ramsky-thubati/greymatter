# greymatter

A local project tracker. It keeps projects, branches of tasks and a summary per project, and serves a web app and an MCP server so Claude Desktop can read and update them.

Only Docker is needed on the host (macOS, or Windows with WSL).

## Run

Create the data folder first. If Docker creates it, it belongs to root and the container can't write to it on Linux/WSL.

```sh
mkdir -p ~/.greymatter
docker compose up -d --build
```

Open http://localhost:4747.

Data lives in `~/.greymatter`. Set `GREYMATTER_DATA` to use another folder. To back up, stop the container (`docker compose down`) and copy that folder.

## Claude Desktop

The container must be running for Claude to connect.

macOS, in `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{ "mcpServers": { "greymatter": { "command": "docker", "args": ["exec", "-i", "greymatter", "node", "dist/mcp/index.js"] } } }
```

Windows with WSL, in `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{ "mcpServers": { "greymatter": { "command": "wsl", "args": ["docker", "exec", "-i", "greymatter", "node", "dist/mcp/index.js"] } } }
```
