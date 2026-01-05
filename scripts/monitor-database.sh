#!/usr/bin/env bash

set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

connection_count=$(psql "$DB_URL" -t -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';" 2>/dev/null | tr -d ' ')
slow_queries=$(psql "$DB_URL" -t -c "SELECT count(*) FROM pg_stat_statements WHERE mean_exec_time > 1000;" 2>/dev/null | tr -d ' ')
db_size=$(psql "$DB_URL" -t -c "SELECT pg_size_pretty(pg_database_size('postgres'));" 2>/dev/null | tr -d ' ')

echo "=== Database Monitor ==="
echo "Active Connections: ${connection_count:-unknown}"
echo "Slow Queries (>1s): ${slow_queries:-unknown}"
echo "Database Size: ${db_size:-unknown}"
echo "Timestamp: $(date)"
echo ""

if [[ -n "${connection_count:-}" && "${connection_count}" -gt 50 ]]; then
  echo "⚠️ High connection count detected!"
fi

if [[ -n "${slow_queries:-}" && "${slow_queries}" -gt 10 ]]; then
  echo "⚠️ Many slow queries detected!"
fi
