#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

resolve_state_dir() {
  local git_path=""
  git_path="$(git -C "${ROOT_DIR}" rev-parse --git-path codex-observe-local 2>/dev/null || true)"
  if [[ -n "${git_path}" ]]; then
    printf '%s\n' "${ROOT_DIR}/${git_path}"
    return 0
  fi

  printf '%s\n' "${ROOT_DIR}/.tmp/codex-observe-local"
  return 0
}

STATE_DIR="$(resolve_state_dir)"
PID_FILE="${STATE_DIR}/server.pid"
LOG_FILE="${STATE_DIR}/server.log"
PORT_FILE="${STATE_DIR}/port"
URL_FILE="${STATE_DIR}/url"
PORT="${OBSERVE_LOCAL_PORT:-3000}"
APP_URL="${OBSERVE_LOCAL_URL:-http://mk.127.0.0.1.nip.io:${PORT}/mk/agent}"
HEALTH_URL="${OBSERVE_LOCAL_HEALTH_URL:-http://127.0.0.1:${PORT}/mk/login}"

mkdir -p "${STATE_DIR}"
printf '%s\n' "${PORT}" > "${PORT_FILE}"
printf '%s\n' "${APP_URL}" > "${URL_FILE}"

is_pid_running() {
  local pid="$1"
  if [[ -z "${pid}" ]]; then
    return 1
  fi
  kill -0 "${pid}" 2>/dev/null
  return $?
}

read_pid() {
  if [[ -f "${PID_FILE}" ]]; then
    tr -d '[:space:]' < "${PID_FILE}"
  fi
  return 0
}

is_port_listening() {
  lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1
  return $?
}

find_listening_pid() {
  lsof -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null | head -n 1
  return 0
}

print_status() {
  local pid=""
  pid="$(read_pid || true)"
  local pid_state="stopped"
  local port_state="down"
  local health_state="down"

  if is_pid_running "${pid}"; then
    pid_state="running"
  fi

  if is_port_listening; then
    port_state="listening"
  fi

  if curl -fsS -o /dev/null --max-time 2 "${HEALTH_URL}"; then
    health_state="ready"
  fi

  printf 'observer=%s pid=%s port=%s health=%s url=%s log=%s\n' \
    "${pid_state}" \
    "${pid:-none}" \
    "${port_state}" \
    "${health_state}" \
    "${APP_URL}" \
    "${LOG_FILE}"
}

start_observer() {
  local pid=""
  pid="$(read_pid || true)"

  if is_pid_running "${pid}"; then
    printf 'observer already running with pid=%s\n' "${pid}"
    print_status
    exit 0
  fi

  if is_port_listening; then
    local adopted_pid=""
    adopted_pid="$(find_listening_pid || true)"
    if [[ -n "${adopted_pid}" ]]; then
      printf '%s\n' "${adopted_pid}" > "${PID_FILE}"
      printf 'observer adopted existing pid=%s on port=%s\n' "${adopted_pid}" "${PORT}"
      print_status
      exit 0
    fi

    printf 'port %s is already in use; refusing to start a second local dev server\n' "${PORT}" >&2
    print_status
    exit 1
  fi

  cd "${ROOT_DIR}"
  nohup pnpm dev:local > "${LOG_FILE}" 2>&1 &
  local child_pid=$!
  printf '%s\n' "${child_pid}" > "${PID_FILE}"

  for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null --max-time 2 "${HEALTH_URL}"; then
      printf 'observer started with pid=%s\n' "${child_pid}"
      print_status
      exit 0
    fi
    sleep 1
  done

  printf 'observer started with pid=%s but health check did not pass within 60s\n' "${child_pid}" >&2
  print_status
  exit 1
}

show_logs() {
  if [[ ! -f "${LOG_FILE}" ]]; then
    local pid=""
    pid="$(read_pid || true)"
    if is_pid_running "${pid}"; then
      printf 'observer is attached to pid=%s but no redirected log file exists at %s\n' \
        "${pid}" \
        "${LOG_FILE}"
      ps -p "${pid}" -o pid=,ppid=,command=
      exit 0
    fi

    printf 'no observer log found at %s\n' "${LOG_FILE}" >&2
    exit 1
  fi
  tail -n "${OBSERVE_LOCAL_TAIL_LINES:-120}" "${LOG_FILE}"
  return 0
}

case "${1:-status}" in
  start)
    start_observer
    ;;
  status)
    print_status
    ;;
  logs)
    show_logs
    ;;
  *)
    printf 'usage: %s {start|status|logs}\n' "$0" >&2
    exit 1
    ;;
esac
