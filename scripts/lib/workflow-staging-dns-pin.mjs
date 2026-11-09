const JOBS = new Set(['deploy-staging', 'e2e-staging', 'rollback-staging-alias']);
const SETUP =
  /^ {6}- \{ uses: \.\/\.github\/actions\/setup, with: \{ install-playwright: '(?:true|false)' \} \}\n/mu;
const PIN_STEP =
  '      # Temporary: remove once interdomestik.com NS no longer CNAME (owner DNS fix)\n' +
  '      - name: Pin staging DNS (temporary NS workaround)\n' +
  '        run: node scripts/ci/pin-staging-dns.mjs\n';

// Temporary, exact additive transition only; remove together with the DNS workaround.
// No YAML normalization: every existing byte, including production and permissions, must match.
export function isStagingDnsPinAddition(file, before, after) {
  if (file !== '.github/workflows/cd.yml' || before.includes('pin-staging-dns.mjs')) return false;
  const changed = new Set();
  const sections = before.split(/(?=^ {2}[a-z][\w-]*:\n)/mu);
  const expected = sections
    .map(section => {
      const name = /^ {2}([a-z][\w-]*):\n/u.exec(section)?.[1];
      if (!JOBS.has(name) || !SETUP.test(section) || changed.has(name)) return section;
      if (!/^ {4}runs-on: ubuntu-latest$/mu.test(section)) return section;
      changed.add(name);
      return section.replace(SETUP, setup => setup + PIN_STEP);
    })
    .join('');
  return changed.size === JOBS.size && after === expected;
}
