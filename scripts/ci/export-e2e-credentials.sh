#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${GITHUB_ENV:-}" ]]; then
  echo "::error::GITHUB_ENV is required to export per-run E2E credentials." >&2
  exit 2
fi

seed_password="${E2E_PASSWORD:-}"
if [[ -z "${seed_password}" ]]; then
  seed_password="E2e-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-0}-$(openssl rand -hex 16)!"
fi

e2e_api_secret="${E2E_API_SECRET:-}"
if [[ -z "${e2e_api_secret}" ]]; then
  e2e_api_secret="$(openssl rand -hex 32)"
fi

echo "::add-mask::${seed_password}"
echo "::add-mask::${e2e_api_secret}"

{
  echo "E2E_PASSWORD=${seed_password}"
  echo "E2E_API_SECRET=${e2e_api_secret}"
  echo "RELEASE_GATE_MEMBER_PASSWORD=${seed_password}"
  echo "RELEASE_GATE_AGENT_PASSWORD=${seed_password}"
  echo "RELEASE_GATE_STAFF_PASSWORD=${seed_password}"
  echo "RELEASE_GATE_ADMIN_KS_PASSWORD=${seed_password}"
  echo "RELEASE_GATE_ADMIN_MK_PASSWORD=${seed_password}"
} >>"${GITHUB_ENV}"
