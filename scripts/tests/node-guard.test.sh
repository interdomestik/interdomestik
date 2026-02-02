#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
GUARD="${ROOT_DIR}/scripts/node-guard.sh"

failures=0

assert_success() {
  local name="$1"
  shift
  if "$@"; then
    echo "✅ ${name}"
  else
    echo "❌ ${name} (expected success)"
    failures=$((failures + 1))
  fi
}

assert_fail() {
  local name="$1"
  shift
  if "$@"; then
    echo "❌ ${name} (expected failure)"
    failures=$((failures + 1))
  else
    echo "✅ ${name}"
  fi
}

assert_contains() {
  local name="$1"
  local haystack="$2"
  local needle="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    echo "✅ ${name}"
  else
    echo "❌ ${name} (missing: ${needle})"
    failures=$((failures + 1))
  fi
}

RUN_STATUS=0
RUN_OUTPUT=""

run_guard() {
  local version="$1"
  local skip="${2:-0}"
  local with_node="${3:-1}"
  local tmpdir
  tmpdir="$(mktemp -d)"

  if [[ "$with_node" == "1" ]]; then
    cat > "${tmpdir}/node" <<EOF
#!/usr/bin/env bash
echo "v${version}"
EOF
    chmod +x "${tmpdir}/node"
  fi

  local -a env_cmd
  env_cmd=(env "PATH=${tmpdir}:/usr/bin:/bin")
  if [[ "$skip" == "1" ]]; then
    env_cmd+=("SKIP_NODE_GUARD=1")
  fi

  set +e
  RUN_OUTPUT="$("${env_cmd[@]}" bash "${GUARD}" 2>&1)"
  RUN_STATUS=$?
  set -e

  rm -rf "${tmpdir}"
}

# 1) Wrong major should fail with guidance
run_guard "25.5.0" 0 1
assert_fail "wrong major fails" test "${RUN_STATUS}" -eq 0
assert_contains "wrong major message" "${RUN_OUTPUT}" "Unsupported Node.js version"
assert_contains "expected version message" "${RUN_OUTPUT}" "Expected: v20.x"

# 2) Correct major should pass
run_guard "20.19.4" 0 1
assert_success "correct major passes" test "${RUN_STATUS}" -eq 0

# 3) Skip flag bypasses
run_guard "25.5.0" 1 1
assert_success "skip guard bypasses" test "${RUN_STATUS}" -eq 0

# 4) Missing node should fail clearly
run_guard "" 0 0
assert_fail "missing node fails" test "${RUN_STATUS}" -eq 0
assert_contains "missing node message" "${RUN_OUTPUT}" "Node.js not found on PATH"

if [[ "$failures" -gt 0 ]]; then
  echo "❌ ${failures} test(s) failed"
  exit 1
fi

echo "✅ All node-guard tests passed"
