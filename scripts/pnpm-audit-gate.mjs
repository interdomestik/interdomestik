import fs from 'node:fs';
import path from 'node:path';

const [,, auditFile, ...allowlist] = process.argv;

if (!auditFile) {
  console.error('Usage: node scripts/pnpm-audit-gate.mjs <audit-json-file> [ALLOWLIST...]');
  process.exit(1);
}

const raw = fs.readFileSync(auditFile, 'utf8').trim();

if (!raw) {
  process.exit(0);
}

const allowed = new Set();
const allowedPathRules = [];

function normalizeAllowlistEntry(entry) {
  if (typeof entry === 'string' || typeof entry === 'number') {
    return { id: String(entry), paths: [] };
  }

  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const id = entry.id ?? entry.ghsaId;
  if (!id) {
    return null;
  }

  const paths = Array.isArray(entry.paths)
    ? entry.paths.map(pathEntry => String(pathEntry))
    : Array.isArray(entry.path)
      ? entry.path.map(pathEntry => String(pathEntry))
      : entry.path
        ? [String(entry.path)]
        : [];

  return {
    id: String(id),
    paths,
  };
}

function loadAllowlistFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return [];
    }
    const rawAllowlist = fs.readFileSync(filePath, 'utf8').trim();
    if (!rawAllowlist) {
      return [];
    }
    const parsed = JSON.parse(rawAllowlist);
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeAllowlistEntry).filter(Boolean);
    }
    if (Array.isArray(parsed.allowlist)) {
      return parsed.allowlist.map(normalizeAllowlistEntry).filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}

const repoAllowlistPath = path.resolve(process.cwd(), 'scripts', 'pnpm-audit-allowlist.json');
loadAllowlistFile(repoAllowlistPath).forEach(entry => {
  allowed.add(entry.id);
  if (entry.paths.length > 0) {
    allowedPathRules.push(entry);
  }
});

if (allowlist.length > 0) {
  allowlist.forEach(entry => {
    if (!entry) {
      return;
    }
    if (fs.existsSync(entry)) {
      loadAllowlistFile(entry).forEach(loadedEntry => {
        allowed.add(loadedEntry.id);
        if (loadedEntry.paths.length > 0) {
          allowedPathRules.push(loadedEntry);
        }
      });
      return;
    }
    allowed.add(String(entry));
  });
}
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

function isAllowedByPath(id, advisory) {
  const matchingRules = allowedPathRules.filter(rule => rule.id === id && rule.paths.length > 0);

  if (matchingRules.length === 0) {
    return false;
  }

  const findings = Array.isArray(advisory.findings) ? advisory.findings : [];
  const observedPaths = findings.flatMap(finding =>
    Array.isArray(finding.paths) ? finding.paths.map(pathEntry => String(pathEntry)) : []
  );

  if (observedPaths.length === 0) {
    return false;
  }

  return observedPaths.every(observedPath =>
    matchingRules.some(rule => rule.paths.includes(observedPath))
  );
}

for (const advisory of advisories.values()) {
  const id = String(advisory.ghsaId || advisory.id);
  const severity = advisory.severity;

  if (!id || !severity) {
    continue;
  }

  if (allowed.has(id)) {
    continue;
  }

  if (isAllowedByPath(id, advisory)) {
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
