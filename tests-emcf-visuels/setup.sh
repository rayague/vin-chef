#!/usr/bin/env bash
set -euo pipefail

npm install
npx playwright install

echo "Setup terminé."
echo "Lance: npm run test:01"
