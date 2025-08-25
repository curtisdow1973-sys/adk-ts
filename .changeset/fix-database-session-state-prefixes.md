---
"@iqai/adk": patch
---

Fix database session service to use consistent state prefixes with in-memory service

The database session service was using hardcoded prefix strings ("app_", "user_", "temp_") instead of the proper State constants (State.APP_PREFIX, State.USER_PREFIX, State.TEMP_PREFIX) that are used by the in-memory session service. This inconsistency could cause state handling issues when switching between session service implementations.