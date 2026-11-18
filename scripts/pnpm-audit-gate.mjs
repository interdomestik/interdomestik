import fs from 'node:fs';

import {
  BLOCKING_SEVERITIES,
  GateError,
  SEVERITIES,
  describe,
  fail,
  isNonEmptyString,
  isNonNegativeInteger,
  isPlainObject,
  parseAuditInput,
} from './pnpm-audit-input.mjs';

// Fail-closed gate for `pnpm audit --prod --audit-level=high --json`.
// Exits 0 only when stdin is a complete, recognized audit report and every
// high/critical advisory record is covered by a precisely applicable allowlist entry.
// Input parsing and shape validation live in ./pnpm-audit-input.mjs.
//
// Conservative gate policy (a deliberate choice, not a claimed pnpm invariant):
// - For high and critical, the summary count must EQUAL the number of distinct
//   findings reported at that severity. pnpm counts one per advisory identity and
//   installed version, so a finding is (identity, finding version), taken across all
//   records of the identity. An identity with no versioned findings counts once; one
//   that mixes versioned and versionless records, or reports a malformed findings
//   collection or version, fails closed. pnpm counts metadata before
//   ignoreGhsas/ignoreCves and its counts can legitimately differ from the advisory
//   details; such reports fail closed for manual review even when legitimate.
// - Every advisory record is scope-checked. Distinct findings are used only for
//   count completeness, so repeated records can never pad a count.
// - Duplicate identities with conflicting severity or module are invalid.

const ALLOWLIST_URL = new URL('./pnpm-audit-allowlist.json', import.meta.url);

function normalizeAllowlistEntry(entry, index) {
  const label = `allowlist entry ${index + 1}`;

  if (isNonEmptyString(entry) || isNonNegativeInteger(entry)) {
    return { id: String(entry), paths: null };
  }

  if (!isPlainObject(entry)) fail(`${label} must be a string, integer or object`);

  const id = entry.id ?? entry.ghsaId;
  if (!isNonEmptyString(id) && !isNonNegativeInteger(id)) fail(`${label} has no valid id/ghsaId`);

  if (entry.paths !== undefined && entry.path !== undefined) {
    fail(`${label} (${id}) must use either path or paths, not both`);
  }

  const rawPaths = entry.paths ?? entry.path;
  const paths = Array.isArray(rawPaths) ? rawPaths : [rawPaths];
  if (rawPaths === undefined || paths.length === 0 || !paths.every(isNonEmptyString)) {
    fail(
      `${label} (${id}) must be path-scoped with non-empty string path(s); use a plain string for an unconditional entry`
    );
  }

  return { id: String(id), paths };
}

function loadAllowlist(cliEntries) {
  const unconditional = new Set();
  const scopedPaths = new Map();
  let entries = [];

  if (fs.existsSync(ALLOWLIST_URL)) {
    const text = fs.readFileSync(ALLOWLIST_URL, 'utf8').trim();
    if (text) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        fail('pnpm-audit-allowlist.json is not valid JSON');
      }
      if (Array.isArray(parsed)) {
        entries = parsed;
      } else if (isPlainObject(parsed) && Array.isArray(parsed.allowlist)) {
        entries = parsed.allowlist;
      } else {
        fail('pnpm-audit-allowlist.json must be an array or { "allowlist": [...] }');
      }
    }
  }

  entries.forEach((entry, index) => {
    const { id, paths } = normalizeAllowlistEntry(entry, index);
    if (!paths) {
      unconditional.add(id);
      return;
    }
    // Path-scoped IDs never enter the unconditional set.
    const known = scopedPaths.get(id) ?? new Set();
    paths.forEach(entryPath => known.add(entryPath));
    scopedPaths.set(id, known);
  });

  // Explicit CLI arguments remain unconditional IDs.
  cliEntries.forEach(entry => {
    if (entry) unconditional.add(String(entry));
  });

  return { unconditional, scopedPaths };
}

function advisoryKey(advisory, label) {
  // Identity unchanged: ghsaId when present, otherwise the advisory id.
  // A present but invalid ghsaId is rejected rather than falling through to id.
  if (advisory.ghsaId !== undefined) {
    if (!isNonEmptyString(advisory.ghsaId)) {
      fail(`${label} has invalid ghsaId ${describe(advisory.ghsaId)}`);
    }
    return advisory.ghsaId;
  }
  if (isNonEmptyString(advisory.id) || isNonNegativeInteger(advisory.id)) {
    return String(advisory.id);
  }
  return fail(`${label} has no valid ghsaId/id`);
}

function readAdvisory(advisory, index) {
  const label = `advisory ${index + 1}`;
  if (!isPlainObject(advisory)) fail(`${label} is not an object`);
  const id = advisoryKey(advisory, label);
  if (!SEVERITIES.includes(advisory.severity)) {
    fail(`advisory ${id} has unrecognized severity ${describe(advisory.severity)}`);
  }
  if (!isNonEmptyString(advisory.module_name)) {
    fail(`advisory ${id} has invalid module_name ${describe(advisory.module_name)}`);
  }
  const npmId =
    isNonEmptyString(advisory.id) || isNonNegativeInteger(advisory.id) ? String(advisory.id) : null;
  return {
    id,
    npmId,
    ghsaId: advisory.ghsaId ?? null,
    severity: advisory.severity,
    module: advisory.module_name,
    findings: advisory.findings,
  };
}

// Repeated records of one identity are allowed (all are scope-checked) only when consistent.
function assertConsistentIdentities(advisories) {
  const seen = new Map();
  // One npm advisory id must keep one identity: with and without a ghsaId it would count twice.
  const ghsaByNpmId = new Map();
  advisories.forEach(advisory => {
    if (advisory.npmId === null) return;
    const known = ghsaByNpmId.get(advisory.npmId);
    if (known !== undefined && known !== advisory.ghsaId) {
      fail(`advisory ${advisory.npmId} is reported with inconsistent ghsaId values`);
    }
    ghsaByNpmId.set(advisory.npmId, advisory.ghsaId);
  });
  advisories.forEach(advisory => {
    const first = seen.get(advisory.id);
    if (!first) {
      seen.set(advisory.id, advisory);
      return;
    }
    if (first.severity !== advisory.severity || first.module !== advisory.module) {
      fail(
        `advisory ${advisory.id} is reported more than once with conflicting severity/module ` +
          `(${first.severity} ${first.module} vs ${advisory.severity} ${advisory.module})`
      );
    }
  });
  return seen.size;
}

// Canonical semantic versions only (no build metadata, no leading zeros, ASCII), so one
// installed version has exactly one spelling.
const IDENTIFIER = '(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)';
const VERSION_PATTERN = new RegExp(
  `^(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-${IDENTIFIER}(?:\\.${IDENTIFIER})*)?$`,
  'u'
);

// Distinct installed versions of one identity across all of its records (at least one).
function identityUnits(id, records) {
  const versions = new Set();
  let versionless = false;
  for (const { findings } of records) {
    if (findings !== undefined && !Array.isArray(findings)) {
      fail(`advisory ${id} has invalid findings ${describe(findings)}`);
    }
    if (!findings || findings.length === 0) {
      versionless = true;
      continue;
    }
    findings.forEach((finding, index) => {
      const version = isPlainObject(finding) ? finding.version : undefined;
      if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
        fail(`advisory ${id} finding ${index + 1} has invalid version ${describe(version)}`);
      }
      versions.add(version);
    });
  }
  if (versionless && versions.size > 0) {
    fail(`advisory ${id} mixes records with and without finding versions`);
  }
  return Math.max(versions.size, 1);
}

function assertBlockingCountsComplete(counts, advisories) {
  BLOCKING_SEVERITIES.forEach(severity => {
    const byIdentity = new Map();
    advisories
      .filter(advisory => advisory.severity === severity)
      .forEach(advisory => {
        byIdentity.set(advisory.id, [...(byIdentity.get(advisory.id) ?? []), advisory]);
      });
    let distinct = 0;
    byIdentity.forEach((records, id) => {
      distinct += identityUnits(id, records);
    });
    if (counts[severity] !== distinct) {
      fail(
        `summary reports ${counts[severity]} ${severity} but ${distinct} distinct ${severity} ` +
          'findings (advisory identity and installed version); conservative completeness ' +
          'policy requires equality (manual review required)'
      );
    }
  });
}

function blockReason(advisory, allowlist) {
  if (allowlist.unconditional.has(advisory.id)) return null;

  const allowedPaths = allowlist.scopedPaths.get(advisory.id);
  if (!allowedPaths) return 'not allowlisted';

  const { findings } = advisory;
  if (!Array.isArray(findings) || findings.length === 0) {
    return 'path-scoped allowlist but advisory has no findings';
  }

  for (const [index, finding] of findings.entries()) {
    const paths = isPlainObject(finding) ? finding.paths : undefined;
    if (!Array.isArray(paths) || paths.length === 0) {
      return `path-scoped allowlist but finding ${index + 1} has no paths`;
    }
    const invalidIndex = paths.findIndex(entryPath => !isNonEmptyString(entryPath));
    if (invalidIndex !== -1) {
      return `finding ${index + 1} has invalid path ${describe(paths[invalidIndex])}`;
    }
    const unlisted = paths.find(entryPath => !allowedPaths.has(entryPath));
    if (unlisted !== undefined) return `path not allowlisted: ${unlisted}`;
  }

  return null;
}

function main() {
  const allowlist = loadAllowlist(process.argv.slice(2));
  const report = parseAuditInput(fs.readFileSync(0, 'utf8'));
  const advisories = report.advisories.map(readAdvisory);
  const distinct = assertConsistentIdentities(advisories);
  assertBlockingCountsComplete(report.counts, advisories);

  // Every record is scope-checked, including repeated records of one identity.
  const blocked = advisories
    .filter(advisory => BLOCKING_SEVERITIES.includes(advisory.severity))
    .map(advisory => ({ ...advisory, reason: blockReason(advisory, allowlist) }))
    .filter(advisory => advisory.reason);

  if (blocked.length > 0) {
    console.error('pnpm audit gate failed. Blocked advisories:');
    blocked.forEach(advisory => {
      console.error(
        `- ${advisory.id} (${advisory.severity}) ${advisory.module}: ${advisory.reason}`
      );
    });
    process.exit(1);
  }

  console.log(
    `pnpm audit gate passed: ${advisories.length} advisory records (${distinct} distinct) checked, ` +
      'no unallowlisted high/critical.'
  );
}

try {
  main();
} catch (error) {
  console.error(`pnpm audit gate failed: ${error instanceof GateError ? error.message : error}`);
  process.exit(1);
}
