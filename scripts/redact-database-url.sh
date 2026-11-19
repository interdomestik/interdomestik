#!/bin/bash
# Prints a database URL with its password masked, for diagnostics that must never show credentials.
set -euo pipefail

redact() {
  local url="$1"
  printf '%s' "${url}" | sed -E 's#(://[^:/@]*):[^/]*@#\1:***@#'
}

redact "${1:-}"
