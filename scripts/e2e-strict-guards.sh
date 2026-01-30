#!/bin/bash
set -e

# E2E Strict Guards
# Enforces strict rules on the E2E codebase.

echo "🛡️  Running E2E Strict Guards..."

EXIT_CODE=0

# 1. No raw page.goto in golden/gate (except exceptions)
echo "   Checking for raw page.goto()..."
FORBIDDEN_GOTO=$(grep -r "page.goto(" apps/web/e2e/golden apps/web/e2e/gate \
  | grep -v "tenant-resolution.spec.ts" \
  | grep -v "apps/web/e2e/golden/legacy/" \
  || true)

if [ -n "$FORBIDDEN_GOTO" ]; then
  echo "❌ Error: Found raw page.goto() in strict suites:"
  echo "$FORBIDDEN_GOTO"
  EXIT_CODE=1
else
  echo "✅ No illegal page.goto() found."
fi

# 2. gotoApp must have marker
echo "   Checking gotoApp usage..."
# Heuristic: Look for gotoApp calls that DON'T have a { marker: ... } or { ... marker: ... }
# This is hard to regex perfectly, so we'll look for simple violations or just rely on the strict template.
# A simpler check: Ensure gotoApp is used.
# Real check: grep lines with gotoApp, ensure "marker" is present nearby.
# For now, let's just warn if we see gotoApp without a comma (implying no options object)
# Note: This is weak, but better than nothing.
# We enforce this with a small parser so multi-line calls are handled reliably.
MISSING_MARKERS=$(python3 - <<'PY'
import re
from pathlib import Path

ROOTS = [Path('apps/web/e2e/golden'), Path('apps/web/e2e/gate')]
EXCLUDE = {
  'apps/web/e2e/gate/tenant-resolution.spec.ts',
}

# Extremely small, pragmatic parser:
# - removes comments
# - finds gotoApp( ... ) calls
# - checks 4th arg exists and contains 'marker'

def strip_comments(s: str) -> str:
  s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
  s = re.sub(r'//.*', '', s)
  return s

def iter_spec_files():
  for root in ROOTS:
    if not root.exists():
      continue
    for p in root.rglob('*.ts'):
      sp = p.as_posix()
      if sp in EXCLUDE:
        continue
      if '/golden/legacy/' in sp:
        continue
      yield p

pat = re.compile(r'\bgotoApp\s*\(')

violations = []
for p in iter_spec_files():
  raw = p.read_text(encoding='utf-8')
  txt = strip_comments(raw)
  i = 0
  while True:
    m = pat.search(txt, i)
    if not m:
      break
    start = m.end()

    # find matching closing paren
    depth = 1
    j = start
    while j < len(txt) and depth:
      c = txt[j]
      if c == '(':
        depth += 1
      elif c == ')':
        depth -= 1
      j += 1

    call = txt[start:j-1]

    # split args at top-level commas
    args = []
    buf = []
    d = 0
    in_str = None
    esc = False

    for ch in call:
      if in_str:
        buf.append(ch)
        if esc:
          esc = False
        elif ch == '\\':
          esc = True
        elif ch == in_str:
          in_str = None
        continue

      if ch in ('"', "'", '`'):
        in_str = ch
        buf.append(ch)
        continue

      if ch in '([{':
        d += 1
      elif ch in ')]}':
        d -= 1

      if ch == ',' and d == 0:
        arg = ''.join(buf).strip()
        if arg:
          args.append(arg)
        buf = []
      else:
        buf.append(ch)

    last = ''.join(buf).strip()
    if last:
      args.append(last)

    has_marker = len(args) >= 4 and ('marker' in args[3])
    if not has_marker:
      line = raw[:m.start()].count('\n') + 1
      violations.append(f"{p.as_posix()}:{line} - gotoApp missing marker")

    i = j

print('\n'.join(violations))
PY
)

if [ -n "$MISSING_MARKERS" ]; then
  echo "❌ Error: Found gotoApp() calls without explicit { marker: ... }:"
  echo "$MISSING_MARKERS"
  EXIT_CODE=1
else
  echo "✅ All gotoApp() calls include an explicit marker."
fi

# 3. No locale-prefixed API usage
echo "   Checking for locale-prefixed API calls..."
FORBIDDEN_API=$(grep -rE "/(sq|mk|en|sr|de|hr)/api" apps/web/e2e | grep -v "\.md" || true)

if [ -n "$FORBIDDEN_API" ]; then
  echo "❌ Error: Found locale-prefixed API calls:"
  echo "$FORBIDDEN_API"
  EXIT_CODE=1
else
  echo "✅ No locale-prefixed API calls found."
fi

# 4. CSP Integrity (Paddle)
echo "   Checking CSP integrity..."
FOUND_PADDLE=0
if [ -f "checkly.config.ts" ] && grep -q "paddle\.com" checkly.config.ts; then
  FOUND_PADDLE=1
fi

if grep -r "paddle\.com" apps/web/src > /dev/null 2>&1; then
  FOUND_PADDLE=1
fi

if [ "$FOUND_PADDLE" -eq 1 ]; then
  echo "✅ CSP allowlist still contains paddle.com"
else
  echo "❌ Error: paddle.com not found in known CSP allowlist locations (checkly.config.ts, apps/web/src)."
  EXIT_CODE=1
fi

exit $EXIT_CODE
