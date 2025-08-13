
<div align="center">

<img src="https://files.catbox.moe/vumztw.png" alt="ADK TypeScript Logo" width="100" />

<br/>



# ADK Discord Bot Starter

**A starter template powered by ADK (AI Development Kit) that enables you to create intelligent, conversational bots for Discord servers.**

_Persistent Memory • Discord Integration • TypeScript_

---

</div>


A Discord bot starter template powered by ADK (AI Development Kit) that enables you to create intelligent, conversational bots for Discord servers. This template provides a solid foundation for building AI-powered Discord bots with persistent conversation memory.

---



## Prerequisites

> **Note**
> You'll need the following before you begin. For details on how to obtain these, see [Configure Your Bot](#3-configure-your-bot).

- **Discord Bot Token**: Create a bot via Discord Developer Portal
- **AI API Key**: Get an API key for your chosen AI model (e.g., Google AI Studio for Gemini)


## Getting Started

Follow these steps to set up and run your Discord bot:

### 1. Environment Setup

Copy the example environment file and add your tokens and API keys:
```bash
cp example.env .env
# Edit .env with your Discord bot token and AI API key
```

### 2. Install Dependencies

If you are starting a new project with the ADK CLI:
```bash
npm install -g @iqai/adk-cli # if you haven't already
adk new --template discord-bot my-discord-bot
cd my-discord-bot
pnpm install
```
Or, if using this template directly, just run:
```bash
pnpm install
```

### 3. Configure Your Bot

- Create a Discord application and bot in the [Discord Developer Portal](https://discord.com/developers/applications)
- Add the bot token to your `.env` file
- Invite the bot to your server

### 4. Running the Bot

**Option 1: Standard Development**
```bash
pnpm dev
```

**Option 2: Fast Iteration & Agent Setup (ADK CLI)**
```bash
# Interactive CLI chat with your agents
adk run

# Web interface for easy testing
adk web
```

### 5. Production
```bash
pnpm build
pnpm start
```


## Environment Variables

Required variables in your `.env` file:

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here

# AI Model Configuration
LLM_MODEL=gemini-2.5-flash
GOOGLE_API_KEY=your_google_api_key_here

# Optional
ADK_DEBUG=false
```

## About MCP & Sampling

This template uses the Model Context Protocol (MCP) to connect your agent to Discord. The MCP server listens for new messages and events, and uses "sampling" to request LLM completions from your agent. This enables your bot to respond to messages and perform actions in Discord, supporting true agentic, bi-directional communication.

For more details, see the [MCP Discord documentation](https://adk.iqai.com/docs/mcp-servers/discord).

## Creating Your Discord Bot

### 1. Create Discord Application

1. **Go to [Discord Developer Portal](https://discord.com/developers/applications)**
2. **Click "New Application"**
3. **Give your application a name** (e.g., "My AI Assistant")
4. **Go to the "Bot" section** in the left sidebar
5. **Click "Add Bot"**
6. **Copy the token** under "Token" section
7. **Add the token** to your `.env` file

### 2. Bot Permissions

In the Discord Developer Portal, under "Bot" section:

### 3. Invite Bot to Server

1. **Go to "OAuth2" > "URL Generator"** in Discord Developer Portal
2. **Select "bot" scope**
3. **Select permissions:**
   - Send Messages
   - Read Message History
   - Use Slash Commands (optional)
   - Add Reactions (optional)
4. **Copy the generated URL** and open it in browser
5. **Select your server** and authorize the bot





## Database

The bot uses SQLite for persistent storage:


## File Structure

```
src/
├── agents/           # Agent definitions (compatible with ADK CLI)
│   ├── agent.ts      # Root agent configuration
│   ├── discord-agent/ # Discord-specific agent and tools
│   ├── joke-agent/   # Joke-telling agent
│   └── weather-agent/ # Weather information agent
├── index.ts          # Main bot initialization and configuration
├── env.ts            # Environment variable validation
└── data/             # SQLite database storage (auto-created)
   └── discord_bot.db
```


## Deployment

### Local Development
```bash
pnpm dev
```

### Production Server
```bash
pnpm build
pnpm start
```

### Docker
```bash
docker build -t discord-bot .
docker run --env-file .env discord-bot
```

## Testing Your Bot

You can test your bot by sending messages to it on Discord, or by using the ADK CLI for local/interactive testing.

## Learn More

- [ADK Documentation](https://adk.iqai.com)
- [MCP Discord Server Docs](https://adk.iqai.com/docs/mcp-servers/discord)
