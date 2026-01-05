#!/usr/bin/env bash

set -euo pipefail

ENV_FILE="${1:-.env.local}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Environment file not found: $ENV_FILE"
  exit 1
fi

./scripts/api-keys.sh monitor "$ENV_FILE"
