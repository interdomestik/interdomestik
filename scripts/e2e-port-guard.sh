#!/bin/bash

configure_e2e_port() {
  E2E_PORT="${PW_PORT:-${PORT:-3000}}"
  if [[ ! "${E2E_PORT}" =~ ^[0-9]+$ ]] || ((E2E_PORT < 1 || E2E_PORT > 65535)); then
    echo "❌ [Gatekeeper] PW_PORT/PORT must be a numeric TCP port between 1 and 65535."
    return 1
  fi
  export E2E_PORT PW_PORT="${E2E_PORT}"
}

clear_task_e2e_port() {
  local stage="${1:-[Gatekeeper]}"
  local pids

  echo "🧭 ${stage} Checking task E2E port ${E2E_PORT}..."
  pids="$(lsof -ti:"${E2E_PORT}" 2>/dev/null || true)"
  if [[ -n "${pids}" && "${INTERDOMESTIK_TASK_OWNS_PORT:-0}" != "1" ]]; then
    echo "❌ ${stage} Port ${E2E_PORT} is occupied and is not task-owned."
    return 1
  fi
  if [[ -n "${pids}" ]]; then
    kill -9 ${pids} 2>/dev/null || true
  fi
  echo "✅ ${stage} Port ${E2E_PORT} clear."
}
