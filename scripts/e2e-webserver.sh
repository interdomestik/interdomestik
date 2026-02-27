#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
bash "${SCRIPT_DIR}/node-guard.sh"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="${ROOT_DIR}/apps/web"

cd "${WEB_DIR}"

PORT="${PORT:-3000}"
HOSTNAME="${HOSTNAME:-127.0.0.1}"
BASE_URL="${NEXT_PUBLIC_APP_URL:-http://${HOSTNAME}:${PORT}}"

export NEXT_PUBLIC_APP_URL="${BASE_URL}"
export BETTER_AUTH_URL="${BETTER_AUTH_URL:-${BASE_URL}}"
export BETTER_AUTH_TRUSTED_ORIGINS="${BETTER_AUTH_TRUSTED_ORIGINS:-http://127.0.0.1:${PORT},http://localhost:${PORT},${BASE_URL}}"
export NODE_OPTIONS="${NODE_OPTIONS:---dns-result-order=ipv4first}"
export INTERDOMESTIK_AUTOMATED="${INTERDOMESTIK_AUTOMATED:-1}"
export PLAYWRIGHT="${PLAYWRIGHT:-1}"

load_env_file() {
	local filePath="$1"
	if [[ ! -f "${filePath}" ]]; then
		return
	fi

	while IFS= read -r rawLine || [[ -n "${rawLine}" ]]; do
		local line
		line="$(printf '%s' "${rawLine}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
		[[ -z "${line}" || "${line}" == \#* ]] && continue

		if [[ "${line}" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
			local key="${BASH_REMATCH[1]}"
			local originalValue="${BASH_REMATCH[2]}"
			local value="${originalValue}"
			local isQuoted=0

			# Preserve explicit env overrides provided by caller/CI (including empty values).
			if [[ -n "${!key+x}" ]]; then
				continue
			fi

			# Trim a single trailing CR (for CRLF files).
			value="${value%$'\r'}"

			if [[ "${value}" =~ ^\"(.*)\"$ ]]; then
				value="${BASH_REMATCH[1]}"
				isQuoted=1
			elif [[ "${value}" =~ ^\'(.*)\'$ ]]; then
				value="${BASH_REMATCH[1]}"
				isQuoted=1
			fi

			if [[ "${isQuoted}" -eq 0 ]]; then
				value="$(printf '%s' "${value}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
				if [[ "${value}" == *[[:space:]]\#* ]]; then
					value="${value%%[[:space:]]\#*}"
					value="$(printf '%s' "${value}" | sed -e 's/[[:space:]]*$//')"
				fi
			fi

			export "${key}=${value}"
		fi
	done < "${filePath}"
}

# Standalone `node .next/standalone/.../server.js` does not auto-load .env files.
# Ensure local dev env is available for the runtime server process.

load_env_file "${ROOT_DIR}/.env"
load_env_file "${ROOT_DIR}/.env.local"
load_env_file "${WEB_DIR}/.env"
load_env_file "${WEB_DIR}/.env.local"

is_placeholder_value() {
	local value="${1:-}"
	[[ -z "${value}" ]] && return 0
	case "${value}" in
	*"your-project.supabase.co"* | "your-anon-key" | "your-service-role-key" | "YOUR_"* | "your_"*)
		return 0
		;;
	esac
	return 1
}

# In deterministic Playwright mode, fall back to local Supabase defaults when
# .env values are placeholders. This keeps gate runs reproducible on fresh clones.
if [[ "${PLAYWRIGHT:-}" == "1" ]]; then
	LOCAL_SUPABASE_URL="http://127.0.0.1:54321"
	LOCAL_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNRe1DMO4cI6Fcqw"
	LOCAL_SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

	if is_placeholder_value "${NEXT_PUBLIC_SUPABASE_URL:-}"; then
		export NEXT_PUBLIC_SUPABASE_URL="${LOCAL_SUPABASE_URL}"
	fi
	if is_placeholder_value "${SUPABASE_URL:-}"; then
		export SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-${LOCAL_SUPABASE_URL}}"
	fi
	if is_placeholder_value "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}"; then
		export NEXT_PUBLIC_SUPABASE_ANON_KEY="${LOCAL_SUPABASE_ANON_KEY}"
	fi
	if is_placeholder_value "${SUPABASE_SERVICE_ROLE_KEY:-}"; then
		export SUPABASE_SERVICE_ROLE_KEY="${LOCAL_SUPABASE_SERVICE_KEY}"
	fi
fi

# Prefer runtime-resolved server Supabase URL where available.
if [[ -z "${SUPABASE_URL:-}" && -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ]]; then
	export SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}"
fi
if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" && -n "${SUPABASE_URL:-}" ]]; then
	export NEXT_PUBLIC_SUPABASE_URL="${SUPABASE_URL}"
fi

# Always ensure nip.io subdomains are trusted for E2E, even in production
NIPIO_ORIGINS=(
	"http://ks.127.0.0.1.nip.io:3000"
	"http://mk.127.0.0.1.nip.io:3000"
	"http://pilot.127.0.0.1.nip.io:3000"
	"http://app.127.0.0.1.nip.io:3000"
	"http://127.0.0.1.nip.io:3000"
)

IFS=',' read -ra EXISTING_ORIGINS <<< "${BETTER_AUTH_TRUSTED_ORIGINS:-}"
MERGED_ORIGINS=""
append_unique_origin() {
	local origin="$1"
	origin="$(printf '%s' "${origin}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
	[[ -z "${origin}" ]] && return

	case ",${MERGED_ORIGINS}," in
	*",${origin},"*)
		return 0
		;;
	esac

	if [[ -z "${MERGED_ORIGINS}" ]]; then
		MERGED_ORIGINS="${origin}"
	else
		MERGED_ORIGINS="${MERGED_ORIGINS},${origin}"
	fi
}

for o in "${EXISTING_ORIGINS[@]}"; do
	append_unique_origin "${o}"
done
for nipio in "${NIPIO_ORIGINS[@]}"; do
	append_unique_origin "${nipio}"
done
BETTER_AUTH_TRUSTED_ORIGINS="${MERGED_ORIGINS}"
export BETTER_AUTH_TRUSTED_ORIGINS

# Playwright gates must be deterministic and must not depend on whatever DATABASE_URL
# happens to be configured in a developer's .env.local (which can point to production).
# Preserve an explicitly provided DATABASE_URL (CI), allow E2E_DATABASE_URL override,
# and otherwise default to local Supabase.
if [[ "${PLAYWRIGHT:-}" == "1" ]]; then
	if [[ -n "${E2E_DATABASE_URL:-}" ]]; then
		export DATABASE_URL="${E2E_DATABASE_URL}"
	elif [[ -z "${DATABASE_URL:-}" ]]; then
		export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
	fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
	export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
fi

if [[ -z "${DATABASE_URL_RLS:-}" ]]; then
	export DATABASE_URL_RLS="${DATABASE_URL}"
fi

# Increase DB timeouts to prevent negative timeout warnings in slow CI envs
export DB_CONNECT_TIMEOUT=60
export DB_IDLE_TIMEOUT=60
export DB_MAX_LIFETIME=3600

if [[ -z "${BETTER_AUTH_SECRET:-}" ]]; then
	export BETTER_AUTH_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))")"
fi

echo "E2E webserver env:"
echo "  BASE_URL=${BASE_URL}"
echo "  NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}"
echo "  SUPABASE_URL=${SUPABASE_URL:-unset}"
echo "  NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL:-unset}"
echo "  BETTER_AUTH_URL=${BETTER_AUTH_URL}"
echo "  BETTER_AUTH_TRUSTED_ORIGINS=${BETTER_AUTH_TRUSTED_ORIGINS}"
echo "  HOSTNAME=${HOSTNAME}"
echo "  PORT=${PORT}"

STANDALONE_SERVER="${WEB_DIR}/.next/standalone/apps/web/server.js"
FALLBACK_STANDALONE_SERVER="${WEB_DIR}/.next/standalone/server.js"
STANDALONE_STAMP_FILE="${WEB_DIR}/.next/standalone/.build-stamp.json"
STANDALONE_STATIC_DIR="${WEB_DIR}/.next/standalone/.next/static"
STANDALONE_APP_STATIC_DIR="${WEB_DIR}/.next/standalone/apps/web/.next/static"
BUILD_STATIC_DIR="${WEB_DIR}/.next/static"
STANDALONE_AUTOREBUILD="${STANDALONE_AUTOREBUILD:-true}"
DID_STANDALONE_REBUILD=0
CURRENT_GIT_SHA=""
STAMP_GIT_SHA=""
STAMP_STATUS_REASON=""

if [[ -d "${BUILD_STATIC_DIR}" ]]; then
	mkdir -p "$(dirname "${STANDALONE_STATIC_DIR}")"
	ln -sfn "${BUILD_STATIC_DIR}" "${STANDALONE_STATIC_DIR}"
	mkdir -p "$(dirname "${STANDALONE_APP_STATIC_DIR}")"
	ln -sfn "${BUILD_STATIC_DIR}" "${STANDALONE_APP_STATIC_DIR}"
fi

should_autorebuild() {
	local value
	value="$(printf '%s' "${STANDALONE_AUTOREBUILD}" | tr '[:upper:]' '[:lower:]')"
	case "${value}" in
	false | 0 | no | off)
		return 1
		;;
	*)
		return 0
		;;
	esac
}

refresh_stamp_status() {
	STAMP_STATUS_REASON=""
	STAMP_GIT_SHA=""
	CURRENT_GIT_SHA="$(resolve_current_git_sha)"

	if [[ ! -f "${STANDALONE_STAMP_FILE}" ]]; then
		STAMP_STATUS_REASON="missing-stamp"
		return 1
	fi

	STAMP_GIT_SHA="$(
		node -e "const fs=require('node:fs');const stamp=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(stamp.gitSha ?? '');" "${STANDALONE_STAMP_FILE}" 2>/dev/null || true
	)"

	if [[ -z "${STAMP_GIT_SHA}" ]]; then
		STAMP_STATUS_REASON="stale-stamp"
		return 1
	fi

	if [[ "${CURRENT_GIT_SHA}" != "unknown" && "${STAMP_GIT_SHA}" != "unknown" && "${CURRENT_GIT_SHA}" != "${STAMP_GIT_SHA}" ]]; then
		STAMP_STATUS_REASON="stale-stamp"
		return 1
	fi

	return 0
}

resolve_current_git_sha() {
	local gitSha
	gitSha="$(git -C "${ROOT_DIR}" rev-parse HEAD 2>/dev/null || true)"
	if [[ -n "${gitSha}" ]]; then
		printf '%s' "${gitSha}"
		return 0
	fi

	local envSha="${GITHUB_SHA:-${VERCEL_GIT_COMMIT_SHA:-${SOURCE_COMMIT:-${COMMIT_SHA:-}}}}"
	if [[ -n "${envSha}" ]]; then
		printf '%s' "${envSha}"
		return 0
	fi

	printf '%s' "unknown"
}

rebuild_standalone_once() {
	if (( DID_STANDALONE_REBUILD == 1 )); then
		return 1
	fi

	if ! should_autorebuild; then
		return 1
	fi

	DID_STANDALONE_REBUILD=1
	echo "⚠️ Standalone artifact ${STAMP_STATUS_REASON} -> rebuilding with build:ci" >&2
	echo "   stamp gitSha: ${STAMP_GIT_SHA:-<missing>}" >&2
	echo "   current HEAD: ${CURRENT_GIT_SHA:-<missing>}" >&2
	pnpm --filter @interdomestik/web run build:ci
	return 0
}

if ! refresh_stamp_status; then
	if rebuild_standalone_once; then
		if ! refresh_stamp_status; then
			echo "❌ Standalone artifact is still invalid after auto-rebuild." >&2
			echo "   reason: ${STAMP_STATUS_REASON}" >&2
			echo "   stamp gitSha: ${STAMP_GIT_SHA:-<missing>}" >&2
			echo "   current HEAD: ${CURRENT_GIT_SHA:-<missing>}" >&2
			echo "   Try: pnpm --filter @interdomestik/web run build:ci" >&2
			exit 1
		fi
	else
		if [[ "${STAMP_STATUS_REASON}" == "missing-stamp" ]]; then
			echo "❌ Missing standalone build stamp: ${STANDALONE_STAMP_FILE}" >&2
		else
			echo "❌ Standalone artifact is stale." >&2
		fi
		echo "   stamp gitSha: ${STAMP_GIT_SHA:-<missing>}" >&2
		echo "   current HEAD: ${CURRENT_GIT_SHA:-<missing>}" >&2
		echo "   Rebuild with: pnpm --filter @interdomestik/web run build:ci" >&2
		echo "   Override: STANDALONE_AUTOREBUILD=true to auto-rebuild once" >&2
		exit 1
	fi
fi

if [[ -f "${STANDALONE_SERVER}" ]]; then
	exec node "${STANDALONE_SERVER}"
fi

if [[ -f "${FALLBACK_STANDALONE_SERVER}" ]]; then
	exec node "${FALLBACK_STANDALONE_SERVER}"
fi

echo "❌ Missing standalone server artifact. Tried:" >&2
echo "   - ${STANDALONE_SERVER}" >&2
echo "   - ${FALLBACK_STANDALONE_SERVER}" >&2
echo "   Run: pnpm --filter @interdomestik/web run build:ci" >&2
echo "   Debug: listing apps/web/.next" >&2
ls -la "${WEB_DIR}/.next" || true
echo "   Debug: listing apps/web/.next/standalone" >&2
ls -la "${WEB_DIR}/.next/standalone" || true
echo "   Debug: find server.js under apps/web/.next (maxdepth 4)" >&2
find "${WEB_DIR}/.next" -maxdepth 4 -name server.js -print || true
exit 1
