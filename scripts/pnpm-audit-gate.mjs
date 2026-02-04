import fs from 'node:fs';

const [,, auditFile, ...allowlist] = process.argv;

if (!auditFile) {
  console.error('Usage: node scripts/pnpm-audit-gate.mjs <audit-json-file> [ALLOWLIST...]');
  process.exit(1);
}

const raw = fs.readFileSync(auditFile, 'utf8').trim();

if (!raw) {
  process.exit(0);
}

const allowed = new Set(allowlist);
const advisories = new Map();

function ingestRecord(record) {
  if (!record || typeof record !== 'object') {
    return;
  }

  if (record.type === 'auditAdvisory' && record.data?.advisory) {
    const advisory = record.data.advisory;
    advisories.set(advisory.ghsaId || advisory.id, advisory);
    return;
  }

  if (record.advisories && typeof record.advisories === 'object') {
    Object.values(record.advisories).forEach(advisory => {
      if (!advisory || typeof advisory !== 'object') {
        return;
      }
      advisories.set(advisory.ghsaId || advisory.id, advisory);
    });
  }
}

try {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    parsed.forEach(ingestRecord);
  } else {
    ingestRecord(parsed);
  }
} catch {
  raw
    .split('\n')
    .filter(Boolean)
    .forEach(line => {
      try {
        ingestRecord(JSON.parse(line));
      } catch {
        // Ignore malformed lines.
      }
    });
}

const blocked = [];

for (const advisory of advisories.values()) {
  const id = advisory.ghsaId || advisory.id;
  const severity = advisory.severity;

  if (!id || !severity) {
    continue;
  }

  if (allowed.has(id)) {
    continue;
  }

  if (severity === 'high' || severity === 'critical') {
    blocked.push({ id, severity, title: advisory.title });
  }
}

if (blocked.length > 0) {
  console.error('pnpm audit gate failed. Blocked advisories:');
  blocked.forEach(advisory => {
    console.error(`- ${advisory.id} (${advisory.severity}): ${advisory.title}`);
  });
  process.exit(1);
}
