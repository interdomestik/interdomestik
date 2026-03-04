#!/usr/bin/env bash
set -euo pipefail

ROOT_ENV_FILE=".env"
ROOT_ENV_EXAMPLE=".env.example"
DOCKER_ENV_FILE="docker/.env"
DOCKER_ENV_EXAMPLE="docker/.env.example"

ensure_env_file() {
  local target="$1"
  local example="$2"
  local message="$3"

  if [[ ! -f "${target}" ]]; then
    echo "${message}"
    cp "${example}" "${target}"
  fi
}

read_env_value() {
  local file="$1"
  local key="$2"

  awk -F= -v target_key="${key}" '$1 == target_key { print substr($0, index($0, "=") + 1); exit }' "${file}"
}

upsert_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp_file
  tmp_file="$(mktemp "${file}.XXXXXX")"

  awk -F= -v target_key="${key}" -v target_value="${value}" '
    BEGIN { updated = 0 }
    $1 == target_key {
      if (updated == 0) {
        print target_key "=" target_value
        updated = 1
      }
      next
    }
    { print }
    END {
      if (updated == 0) {
        print target_key "=" target_value
      }
    }
  ' "${file}" > "${tmp_file}"

  mv "${tmp_file}" "${file}"
}

prepare_docker_env() {
  ensure_env_file "${ROOT_ENV_FILE}" "${ROOT_ENV_EXAMPLE}" \
    "⚠️  Missing .env; creating from .env.example for local Docker runs."
  ensure_env_file "${DOCKER_ENV_FILE}" "${DOCKER_ENV_EXAMPLE}" \
    "⚠️  Missing docker/.env; creating from docker/.env.example."

  local root_database_url
  root_database_url="$(read_env_value "${ROOT_ENV_FILE}" "DATABASE_URL")"
  if [[ "${root_database_url}" == "postgresql://postgres:postgres@localhost:54322/postgres" || \
    "${root_database_url}" == "postgresql://postgres:postgres@127.0.0.1:54322/postgres" ]]; then
    upsert_env_var "${DOCKER_ENV_FILE}" "DATABASE_URL" \
      "postgresql://postgres:postgres@host.docker.internal:54322/postgres"
  fi

  local root_auth_secret
  root_auth_secret="$(read_env_value "${ROOT_ENV_FILE}" "BETTER_AUTH_SECRET")"
  if [[ -z "${root_auth_secret}" || \
    "${root_auth_secret}" == "your-random-secret-key-min-32-chars" ]]; then
    upsert_env_var "${DOCKER_ENV_FILE}" "BETTER_AUTH_SECRET" \
      "local-docker-dev-secret-32chars-minimum"
  fi
}
