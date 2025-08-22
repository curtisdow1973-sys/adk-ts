---
"@iqai/adk-cli": patch
---

Enhance the loading mechanism to check for multiple environment files in a specified priority order, ensuring that environment variables are set only if they are not already defined. Additionally, provide warnings for any errors encountered while loading these files.
