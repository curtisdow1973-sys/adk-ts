---
"@iqai/adk": minor
---

## Features
- Introduced conditional typing for multi-agent responses in `EnhancedRunner`, `BuiltAgent`, and `AgentBuilderWithSchema`. The ask() method now returns appropriate response type based on agent configuration.
- Improved `AgentBuilder` methods (asSequential, asParallel, and related build methods) for better type propagation and correct return types for multi-agent aggregators.
- Output schemas can no longer be set directly on multi-agent aggregators. Schemas must now be defined on individual sub-agents.

## Fixes
- Bugfix in mergeAgentRun that caused incorrect removal of resolved promises.

## Changes
- `ask()` implementation tailored to aggregate and return per-agent responses for multi-agent setups while maintaining schema validation for single-agent cases.
- Now, `AgentBuilder` and `BuiltAgent` are being re-exported explicitly from the ADK entrypoint for type preservation in bundled declarations.
