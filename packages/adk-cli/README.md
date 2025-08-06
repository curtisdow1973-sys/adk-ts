# @iqai/adk-cli

Command-line interface for the ADK (Agent Development Kit) - a comprehensive toolkit for creating, running, and testing AI agents.

## Installation

```bash
npm install -g @iqai/adk-cli
```

## Commands

### `adk new`

Create a new ADK project from a template.

```bash
# Interactive project creation
adk new

# Create with specific name and template
adk new my-agent --template simple-agent
```

**Available templates:**
- `simple-agent` - Basic agent with chat capabilities
- `discord-bot` - Agent integrated with Discord
- `telegram-bot` - Agent integrated with Telegram  
- `hono-server` - Web server with agent endpoints
- `mcp-starter` - Model Context Protocol server

### `adk run`

Run an agent from the current directory. Automatically discovers `agent.ts` or `agent.js` files.

```bash
# Run agent from current directory or ./agents
adk run

# Run specific agent file
adk run path/to/agent.ts

# Run with watch mode (restart on file changes)
adk run --watch

# Run on specific port
adk run --port 3000
```

**Agent Discovery:**
- Looks for `agent.ts` or `agent.js` in current directory
- Scans `./agents` directory and subdirectories
- Supports nested agent structures like `./agents/chatbot/agent.ts`

### `adk web`

Start a web interface for testing agents with a React-based UI.

```bash
# Start web interface on default port 3001
adk web

# Start on specific port
adk web --port 8080

# Scan different directory for agents
adk web --dir ./my-agents
```

**Web Interface Features:**
- Visual agent browser and selector
- Interactive chat interface for testing
- Real-time agent status monitoring
- Start/stop agents directly from the UI
- Live output streaming from agents

## Project Structure

The CLI expects your project to follow this structure:

```
my-project/
├── agents/
│   ├── agent.ts                 # Main agent
│   ├── chatbot/
│   │   └── agent.ts            # Chatbot agent
│   └── assistant/
│       └── agent.ts            # Assistant agent
├── src/
└── package.json
```

## Usage Examples

### Quick Start

```bash
# Create a new project
adk new my-ai-bot --template simple-agent
cd my-ai-bot

# Install dependencies
npm install

# Run the agent
adk run

# Test with web interface
adk web
```

### Development Workflow

```bash
# Start agent in watch mode for development
adk run --watch

# In another terminal, start web interface
adk web --port 3002
```

### Multiple Agents

```bash
# Create agents in subdirectories
mkdir -p agents/chatbot agents/assistant

# Each directory can have its own agent.ts
echo "// Chatbot agent" > agents/chatbot/agent.ts  
echo "// Assistant agent" > agents/assistant/agent.ts

# Web interface will discover all agents
adk web
```

## Environment Variables

- `PORT` - Default port for agent server (default: 3000)
- `NODE_ENV` - Node environment (set to 'development' by CLI)

## Requirements

- Node.js 22.0 or higher
- TypeScript support via tsx (automatically handled)

## License

MIT
