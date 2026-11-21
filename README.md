# greymatter

A local project tracker. It keeps projects, branches of tasks and a summary per project, and serves a web app and an MCP server so Claude Desktop can read and update them.

Only Docker is needed on the host (macOS, or Windows with WSL).

On Windows, run the `mkdir -p ~/.greymatter` and `docker compose up -d --build` commands below in the WSL shell. Docker Desktop's WSL integration must be on for that distro.

## Run

Create the data folder first. If Docker creates it, it belongs to root and the container can't write to it on Linux/WSL.

```sh
mkdir -p ~/.greymatter
docker compose up -d --build
```

Open http://localhost:4747.

The app listens on 127.0.0.1 only and has no login. Don't publish port 4747 on other interfaces.

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

`wsl` in this config runs your default WSL distro, so that distro needs Docker access too.
