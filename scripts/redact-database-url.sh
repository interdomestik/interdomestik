#!/bin/bash
# Reads a database URL on stdin and prints it with its password masked, for diagnostics that
# must never show credentials. The URL arrives on stdin so it never appears in a process's argv.
set -euo pipefail

sed -E 's#(://[^:/@]*):[^/]*@#\1:***@#'
