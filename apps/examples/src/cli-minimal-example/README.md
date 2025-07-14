# ADK CLI Demo with Existing Examples

This guide demonstrates how to use the ADK CLI with the existing `tool-usage` example, which includes a complete agent with Calculator and Weather tools.

## Prerequisites

```bash
# ADK CLI is available via npx
npx adk --version

# Optional: Install Graphviz for agent visualization
# macOS: brew install graphviz
# Ubuntu: sudo apt-get install graphviz
```

## Using CLI with tool-usage Example

The `tool-usage` example is perfect for CLI demonstration as it includes:

- LlmAgent with Calculator and Weather tools
- Session management
- Multi-turn conversations
- Error handling

### Step 1: Create a CLI-Compatible Agent

The existing examples are demo scripts, not CLI agents. First, create a proper CLI agent:

```bash
# Create a new CLI-compatible agent
npx adk create my-tool-agent

# This creates the proper structure:
# my-tool-agent/
# ├── agent.ts          # Exports rootAgent
# ├── package.json
# ├── tsconfig.json
# └── .env
```

### Step 2: CLI Commands Demo

#### Interactive Terminal Chat

```bash
# Run the CLI-compatible agent
npx adk run my-tool-agent

# Or navigate into the directory
cd my-tool-agent
npx adk run .
```

**Example Chat Session:**

```
🤖 Tool Assistant: Hello! I can help you with calculations and weather information. What would you like to know?

👤 You: What's 15 + 27?

🤖 Tool Assistant: [Calling calculator tool...]
The answer is 42.

👤 You: What's the weather like in New York?

🤖 Tool Assistant: [Calling weather tool...]
The weather in New York is sunny with a temperature of 72°F.

👤 You: Can you calculate the tip for a $50 dinner with 18% tip, and then tell me if it's good weather for dining outside in London?

🤖 Tool Assistant: [Calling calculator and weather tools...]
The tip for a $50 dinner at 18% would be $9.00, making your total $59.00.
As for London, it's currently cloudy with light rain at 60°F - you might want to choose indoor dining!
```

#### Web Development UI

```bash
# Start web interface for your agent
npx adk web my-tool-agent --port 3000

# Access at http://localhost:3000
```

Features in Web UI:

- Real-time chat interface
- Tool call visualization
- Session state inspection
- Multi-agent support

#### API Server for Integration

```bash
# Start REST API server
npx adk api_server --agent_dir my-tool-agent --port 8000

# With web UI included
npx adk api_server --agent_dir my-tool-agent --with_ui --port 8000
```

**API Usage Examples:**

```bash
# Create a session
curl -X POST http://localhost:8000/sessions \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123", "appName": "tool-usage-demo", "state": {}}'

# Send a calculation request
curl -X POST http://localhost:8000/agents/run \
  -H "Content-Type: application/json" \
  -d '{
    "appName": "tool-usage-demo",
    "userId": "user123",
    "sessionId": "session-123",
    "newMessage": {"type": "text", "text": "Calculate 25 * 4 + 10"},
    "streaming": false
  }'

# Send a weather request
curl -X POST http://localhost:8000/agents/run \
  -H "Content-Type: application/json" \
  -d '{
    "appName": "tool-usage-demo",
    "userId": "user123",
    "sessionId": "session-123",
    "newMessage": {"type": "text", "text": "What is the weather in Tokyo?"},
    "streaming": false
  }'
```

#### Agent Visualization

```bash
# Generate agent graph (requires Graphviz)
npx adk graph src/tool-usage --output tool-usage-graph.png

# Highlight specific tool connections
npx adk graph src/tool-usage --highlight "tool_assistant,calculator" --output graph.png
```

### Step 3: Create Evaluation Tests

Create an evaluation file for the tool-usage example:

```json
# Create: apps/examples/tool-usage-eval.test.json
[
  {
    "name": "calculator_basic",
    "description": "Test basic calculator functionality",
    "initial_state": {},
    "input": "What is 15 + 27?",
    "expected_output_contains": ["42"],
    "expected_tool_calls": ["calculator"],
    "max_iterations": 3
  },
  {
    "name": "weather_query",
    "description": "Test weather information retrieval",
    "initial_state": {},
    "input": "What's the weather like in New York?",
    "expected_output_contains": ["weather", "New York"],
    "expected_tool_calls": ["weather"],
    "max_iterations": 3
  },
  {
    "name": "multi_tool_usage",
    "description": "Test using both calculator and weather tools",
    "initial_state": {},
    "input": "Calculate 20% tip on $80 and tell me the weather in London",
    "expected_output_contains": ["tip", "16", "weather", "London"],
    "expected_tool_calls": ["calculator", "weather"],
    "max_iterations": 5
  }
]
```

```bash
# Run evaluations
npx adk eval src/tool-usage tool-usage-eval.test.json

# With detailed results
npx adk eval src/tool-usage tool-usage-eval.test.json --print_detailed_results
```

### Step 4: Deploy to Cloud Run

```bash
# Deploy the tool-usage example to Google Cloud Run
npx adk deploy cloud_run src/tool-usage \
  --project "your-gcp-project" \
  --region "us-central1" \
  --service_name "tool-usage-api" \
  --with_ui
```

## Quick Start Commands

```bash
# From apps/examples directory:

# 1. Interactive chat
npx adk run src/tool-usage

# 2. Web UI (new terminal)
npx adk web src/tool-usage --port 3000

# 3. API server (new terminal)
npx adk api_server --agent_dir src/tool-usage --port 8000 --with_ui

# 4. Generate graph
npx adk graph src/tool-usage --output docs/tool-usage-architecture.png

# 5. Run tests
npx adk eval src/tool-usage tool-usage-eval.test.json
```

## Example Interactions

### Calculator Tool Examples

- "What's 25 \* 4?"
- "Calculate the square root of 144"
- "What's 15% of 200?"

### Weather Tool Examples

- "What's the weather in Paris?"
- "Is it raining in Seattle?"
- "What's the temperature in Tokyo?"

### Multi-Tool Examples

- "Calculate a 20% tip on $45.50 and tell me if it's good weather for outdoor dining in San Francisco"
- "What's 12 \* 8, and is it sunny in Miami?"
- "If I buy 3 items at $12.99 each, what's my total, and what's the weather like in New York?"

## Development Tips

1. **Use existing examples**: The `apps/examples/src/` directory has many ready-to-use agents
2. **Hot reload**: Add `--reload` flag for development
3. **Session persistence**: Use `--session_db_url` for persistent sessions
4. **Multi-agent setup**: Use `npx adk api_server --agent_dir .` to serve all examples
5. **Debugging**: Use `DEBUG=true` environment variable for detailed logs

## Other Examples to Try

```bash
# Simple conversational agent
npx adk run src/simple-agent

# Specialized domain agents
npx adk run src/specialized-agents

# Memory usage demonstration
npx adk run src/memory-usage

# Flow-based agents
npx adk run src/flows-example
```

This approach leverages existing, tested examples while demonstrating the full CLI workflow from development to deployment!
