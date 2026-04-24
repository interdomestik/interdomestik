#!/bin/bash
set -euo pipefail

echo "🔍 Checking enforced E2E locale contracts..."

pnpm check:e2e-contracts
