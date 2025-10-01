#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

echo "🔍 Detecting changed packages..."

# Get changed packages using Turborepo
CHANGED=$(pnpm turbo run build --filter=...[origin/main] --dry=json | jq -r '.tasks[].package')

if echo "$CHANGED" | grep -qE '^(apps/docs|apps/examples|apps/adk-web)'; then
  echo "📄 Docs/Examples changed → Running Biome only..."
  pnpm format && pnpm lint
fi

if echo "$CHANGED" | grep -qE '^(packages/)'; then
  echo "🧪 Packages or ADK-Web changed → Running Biome + Tests..."
  pnpm format && pnpm lint && pnpm test
fi
