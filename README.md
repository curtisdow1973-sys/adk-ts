<div align="center">

<img src="https://files.catbox.moe/vumztw.png" alt="ADK TypeScript Logo" width="100" />

<br/>

# ADK TS: Agent Development Kit

**A comprehensive TypeScript framework for building sophisticated AI agents with multi-LLM support, advanced tools, and flexible conversation flows.**

_Production-ready • Multi-Agent Systems • Extensible Architecture_

<p align="center">
  <a href="https://www.npmjs.com/package/@iqai/adk">
    <img src="https://img.shields.io/npm/v/@iqai/adk" alt="NPM Version" />
  </a>
  <a href="https://www.npmjs.com/package/@iqai/adk">
    <img src="https://img.shields.io/npm/dm/@iqai/adk" alt="NPM Downloads" />
  </a>
  <a href="https://github.com/IQAIcom/adk-ts/blob/main/LICENSE.md">
    <img src="https://img.shields.io/npm/l/@iqai/adk" alt="License" />
  </a>
  <a href="https://github.com/IQAIcom/adk-ts">
    <img src="https://img.shields.io/github/stars/IQAIcom/adk-ts?style=social" alt="GitHub Stars" />
  </a>
</p>

---

</div>

## 🌟 Overview

The Agent Development Kit (ADK) for TypeScript provides a comprehensive framework for building sophisticated AI agents with multi-LLM support, advanced tool integration, memory systems, and flexible conversation flows. Built from the ground up for production use, ADK enables developers to create intelligent, autonomous systems that can handle complex multi-step tasks.

## 🚀 Quick Start

### Create a New Project

Get started quickly with our CLI tool:

```bash
npx create-adk-project
```

### Manual Installation

```bash
npm install @iqai/adk
```

### Simple Example

```typescript
import { AgentBuilder } from "@iqai/adk";

const response = await AgentBuilder.withModel("gpt-4.1").ask("What is the primary function of an AI agent?");

console.log(response);
```

## 📚 Documentation

For comprehensive guides, API reference, and advanced examples, visit our documentation:

**[https://adk.iqai.com](https://adk.iqai.com)**

The documentation includes:

- Getting started tutorials
- API reference
- Advanced usage patterns
- Multi-agent systems
- Tool development
- Memory and session management
- Production deployment guides

## 🧪 Examples

Explore comprehensive examples in the `apps/examples` directory:

```bash
# 1. Clone and setup
git clone https://github.com/IQAIcom/adk-ts.git
cd adk-ts
pnpm install

# 2. Build the ADK package (required for examples to work)
pnpm build

# 3. Setup API keys
cd apps/examples
echo "GOOGLE_API_KEY=your_google_api_key_here" > .env

# 4. Run examples
pnpm start
```

**⚠️ Important:** The examples require API keys from at least one LLM provider. Create a `.env` file in the `apps/examples` directory with your chosen provider's API key.

**Get API Keys:**

- **Google AI**: [https://makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey)
- **OpenAI**: [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Anthropic**: [https://console.anthropic.com/](https://console.anthropic.com/)

## 🤝 Contributing

We welcome contributions! See our [Contributing Guide](CONTRIBUTION.md) for details on:

- Framework architecture
- Development setup
- Implementation patterns
- Coding standards

## 📜 License

MIT License - see [LICENSE](LICENSE.md) for details.

---

**Ready to build your first AI agent?** Visit [https://adk.iqai.com](https://adk.iqai.com) to get started!
