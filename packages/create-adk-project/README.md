# create-adk-project

A CLI tool to quickly create ADK TypeScript projects with different frameworks.

## Usage

```bash
npx create-adk-project
```

Or install globally:

```bash
npm install -g create-adk-project
create-adk-project
```

## Templates

- **basic** - Basic ADK project with TypeScript
- **hono** - ADK project with Hono web framework
- **express** - ADK project with Express.js framework
- **nextjs** - ADK project with Next.js framework
- **fastify** - ADK project with Fastify framework

## Options

- `--template, -t <template>` - Specify template (basic, hono, express, nextjs, fastify)
- `--yes, -y` - Skip prompts and use defaults
- `--version` - Show version number
- `--help` - Show help

## Examples

```bash
# Interactive mode
npx create-adk-project

# Specify project name
npx create-adk-project my-agent

# Use specific template
npx create-adk-project my-agent --template hono

# Skip prompts
npx create-adk-project my-agent --template basic --yes
```

## Templates Repository

The templates are stored in a separate repository: [adk-ts-templates](https://github.com/IQAIcom/adk-ts-templates)

## Features

- 🚀 Interactive prompts powered by clack
- 📦 Multiple framework templates
- 🎨 Beautiful CLI interface with colors
- 📋 Package manager selection (npm, pnpm, yarn)
- ✅ Automatic dependency installation
- 🔧 Automatic project configuration

## License

MIT
