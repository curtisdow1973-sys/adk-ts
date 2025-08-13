# 🤖 ADK Agent Starter

This is a starter template to start building your own agent with `@iqai/adk` library. 

## 🚀 Get Started
Start by cloning the repository or clicking on use as template button on github ui. 

```bash
git clone https://github.com/IQAICOM/adk-agent-starter.git
```

📦 Install the dependencies

```bash
pnpm install
```

▶️ Run the agent

**Option 1: Traditional Development**
```bash
pnpm dev
```

**Option 2: ADK CLI (Recommended for Interactive Testing)**

First, install the ADK CLI globally:
```bash
npm install -g @iqai/adk-cli
```

Then use either:
```bash
# Interactive CLI chat with your agents
adk run

# Web interface for easy testing and demonstration
adk web
```

## 📁 Folder Structure
The main agent code lives in `index.ts` where the subagents live inside the `agents` folder. The `agents/agent.ts` file is compatible with the ADK CLI for easy testing.

```
├── src/
│   ├── agents/
│   │   ├── agent.ts          # Root agent (ADK CLI compatible)
│   │   ├── joke-agent/       # Joke-telling sub-agent
│   │   │   ├── agent.ts
│   │   │   └── tools.ts
│   │   └── weather-agent/    # Weather information sub-agent
│   │       ├── agent.ts
│   │       └── tools.ts
│   ├── env.ts                # Environment variable validation
│   └── index.ts              # Main execution entry point
```

## ⚙️ Environment Setup
Make sure to configure your environment variables:

```bash
cp .env.example .env
```

## 🧰 Dev Tools
This starter includes:
- **GitHub Actions**: CI/CD pipeline
- 📦 **PNPM**: Fast package manager
- 🤖 **ADK CLI**: Interactive testing with `adk run` and `adk web`

## 🧪 Testing Your Agent

**Traditional Testing**: Run `pnpm dev` to execute the sample questions.

**Interactive Testing with ADK CLI**:
1. Install: `npm install -g @iqai/adk-cli`
2. Run: `adk run` for CLI chat or `adk web` for web interface
3. Perfect for development, testing, and demonstrating your agent's capabilities

## 🏗️ Building Your Agent
1. **Create new agents** in the `src/agents/` directory
2. **Add tools** to your agents in the `tools/` subdirectory
3. **Configure services** in the `src/services/` directory
4. **Update environment** variables in `src/env.ts`

## 📚 Links
- [ADK Library](https://github.com/IQAICOM/adk-ts)

## 🤝 Contributing
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License
MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support
If you encounter any issues or have questions:
- 📝 [Create an issue](https://github.com/IQAICOM/adk-agent-starter/issues)