# Agent Output Key Example: Restaurant Order Processing

This example demonstrates three key concepts in the ADK framework:

## 1. **Output Keys** (`outputKey`)
Each agent can store its results in the shared state using an `outputKey`:

```typescript
const customerAnalyzer = new LlmAgent({
  // ... other config
  outputKey: "customer_preferences", // ✅ Stores result here
});
```

The agent's response will be automatically stored in the shared state under this key, making it available to subsequent agents.

## 2. **Common State** (Shared State Between Agents)
All agents in a sequence can access data stored by previous agents:

- `customerAnalyzer` stores → `customer_preferences`
- `menuValidator` stores → `menu_validation` 
- `orderProcessor` stores → `final_order`
- `kitchenInstructor` can access all previous data

## 3. **Instruction Injection** (Template Variables)
Agents can reference shared state data in their instructions using `{key}` syntax:

```typescript
const menuValidator = new LlmAgent({
  instruction: dedent`
    Based on the customer preferences: {customer_preferences}
    // The actual data will be injected here at runtime
  `,
});
```

## Example Flow

1. **Customer Analyzer** → Extracts preferences, dietary restrictions → `customer_preferences`
2. **Menu Validator** → Uses `{customer_preferences}` → Validates against menu → `menu_validation`
3. **Order Processor** → Uses `{customer_preferences}` + `{menu_validation}` → Creates final order → `final_order`
4. **Kitchen Instructor** → Uses all previous data → Generates kitchen instructions

## Why This Example Works Better

Unlike the sentiment conversion example, this restaurant system:

- **Clear Data Flow**: Each step builds meaningfully on the previous
- **Realistic Use Case**: Shows how state injection solves real problems
- **Multiple Dependencies**: Later agents use multiple pieces of shared state
- **Practical Application**: Demonstrates how this pattern works in business logic

## Running the Example

```bash
cd apps/examples
npm run dev src/agent-output-key/index.ts
```

The example processes a complex restaurant order with multiple dietary restrictions and preferences, showing how each agent contributes specific information that subsequent agents can use.
