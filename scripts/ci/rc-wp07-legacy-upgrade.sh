#!/usr/bin/env bash
set -euo pipefail
log_file="${RC_LOGS_DIR}/wp07_legacy_upgrade.log"
set +e
pnpm db:wp07:legacy-upgrade 2>&1 | tee "${log_file}"
exit_code=${PIPESTATUS[0]}
set -e
printf '%s\n' "${exit_code}" > "${RC_LOGS_DIR}/wp07_legacy_upgrade.exit"
exit "${exit_code}"
