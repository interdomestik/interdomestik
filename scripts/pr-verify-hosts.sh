#!/usr/bin/env bash
set -euo pipefail

export KS_HOST="${KS_HOST:-ks.localhost:3000}"
export MK_HOST="${MK_HOST:-mk.localhost:3000}"

pnpm pr:verify
