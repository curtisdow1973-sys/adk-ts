---
"@iqai/adk": patch
---

- adds @iqai/mcp-discord mcp definition
- update EnhancedRunner.ask() to take in message type LlmRequest
- update SamplingHandler response type to be LlmResponse | string for more flexibility when used with enhanced runner
