#!/usr/bin/env bash

set -euo pipefail

patterns=(
  "sk_[a-zA-Z0-9]{24,}"
  "pk_[a-zA-Z0-9]{24,}"
  "sk-[a-zA-Z0-9]{20,}"
  "re_[a-zA-Z0-9]{20,}"
  "whsec_[a-zA-Z0-9]{20,}"
  "AIza[a-zA-Z0-9_-]{35}"
  "ghp_[a-zA-Z0-9]{36}"
  "github_pat_[a-zA-Z0-9_]{20,}"
  "sonar\\.token\\s*="
  "SONAR_TOKEN\\s*="
  "squ_[a-zA-Z0-9]{20,}"
  "sqp_[a-zA-Z0-9]{20,}"
  "pdl_[a-zA-Z0-9_+-]{20,}"
  "xaat-[a-zA-Z0-9-]{10,}"
  "-----BEGIN (RSA|OPENSSH|EC) PRIVATE KEY-----"
  "xox[baprs]-[a-zA-Z0-9-]{10,48}"
)

diff_output="$(git diff --cached -U0)"

if [[ -z "$diff_output" ]]; then
  exit 0
fi

scan_match() {
  local pattern="$1"
  if command -v rg >/dev/null 2>&1; then
    echo "$diff_output" | rg -n -e "$pattern" >/dev/null
  else
    echo "$diff_output" | grep -E "$pattern" >/dev/null
  fi
}

for pattern in "${patterns[@]}"; do
  if scan_match "$pattern"; then
    echo "Potential secret detected in staged changes (pattern: $pattern)."
    echo "Remove secrets or move them to .env.local."
    exit 1
  fi
done
