// Dependency-free input layer for scripts/pnpm-audit-gate.mjs: shared GateError,
// constants and validators, plus the fail-closed parser for
// `pnpm audit --prod --audit-level=high --json` output.
//
// Accepted shapes: a pnpm report object (array or keyed advisories), or a legacy
// record stream (JSON array or NDJSON) of auditAdvisory records closed by one
// auditSummary. Muted advisories, legacy auditAction records and explicit
// error/status fields are unsupported: there is no reconciliation design that lets
// them pass safely.
//
// Importing this module has no side effects: it never reads stdin or exits.

export const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];
export const BLOCKING_SEVERITIES = ['high', 'critical'];
const ERROR_FIELDS = ['error', 'errors', 'code', 'message', 'status', 'statusCode'];

export class GateError extends Error {}

export function fail(message) {
  throw new GateError(message);
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

export function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function describe(value) {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function rejectErrorFields(value, label) {
  const field = ERROR_FIELDS.find(key => Object.hasOwn(value, key));
  if (field !== undefined) fail(`${label} has explicit ${field} field: ${describe(value[field])}`);
}

function readVulnerabilityCounts(vulnerabilities, label) {
  if (!isPlainObject(vulnerabilities)) fail(`${label} has no vulnerabilities summary`);
  Object.keys(vulnerabilities).forEach(key => {
    if (!SEVERITIES.includes(key)) fail(`${label} reports unrecognized severity ${describe(key)}`);
  });
  SEVERITIES.forEach(severity => {
    if (!isNonNegativeInteger(vulnerabilities[severity])) {
      fail(`${label} vulnerabilities.${severity} must be a non-negative integer`);
    }
  });
  return vulnerabilities;
}

// Actions are upgrade recommendations, never authorization: only their envelope is checked.
function readActions(actions) {
  if (!Array.isArray(actions)) {
    fail('audit report has no actions array (incomplete or unsupported shape)');
  }
  actions.forEach((action, index) => {
    const label = `audit action ${index + 1}`;
    if (!isPlainObject(action)) fail(`${label} is not an object`);
    rejectErrorFields(action, label);
    if (!isNonEmptyString(action.action) || !Array.isArray(action.resolves)) {
      fail(`${label} has no action/resolves`);
    }
  });
}

function readPnpmReport(report) {
  rejectErrorFields(report, 'audit report');
  if (!isPlainObject(report.metadata)) {
    fail('audit report has no metadata (incomplete or unsupported shape)');
  }
  rejectErrorFields(report.metadata, 'audit metadata');
  const counts = readVulnerabilityCounts(report.metadata.vulnerabilities, 'audit metadata');

  readActions(report.actions);

  if (!Array.isArray(report.muted)) {
    fail('audit report has no muted array (incomplete or unsupported shape)');
  }
  if (report.muted.length > 0) {
    fail(
      `audit report mutes ${report.muted.length} advisories; muting is unsupported (manual review required)`
    );
  }

  if (Array.isArray(report.advisories)) return { advisories: report.advisories, counts };
  if (isPlainObject(report.advisories)) {
    return { advisories: Object.values(report.advisories), counts };
  }
  return fail('audit report has no advisories collection (incomplete or unsupported shape)');
}

// Legacy streams are accepted only as auditAdvisory records closed by one auditSummary.
// auditAction records are rejected: no trustworthy action-stream schema was selected.
function readRecordStream(records) {
  if (records.length === 0) fail('audit record stream is empty');

  const advisories = [];
  let counts = null;

  records.forEach((record, index) => {
    const label = `audit record ${index + 1}`;
    if (counts) fail(`${label} follows auditSummary (corrupt stream)`);
    if (!isPlainObject(record)) fail(`${label} is not an object`);
    rejectErrorFields(record, label);

    if (record.type === 'auditAction') {
      fail(`${label} is an auditAction record; action streams are unsupported`);
    }
    if (record.type !== 'auditAdvisory' && record.type !== 'auditSummary') {
      fail(`${label} has unsupported type ${describe(record.type)}`);
    }
    if (!isPlainObject(record.data)) fail(`${label} ${record.type} has no data`);
    rejectErrorFields(record.data, `${label} data`);

    if (record.type === 'auditAdvisory') {
      if (!isPlainObject(record.data.advisory)) fail(`${label} auditAdvisory has no advisory`);
      advisories.push(record.data.advisory);
    } else {
      counts = readVulnerabilityCounts(record.data.vulnerabilities, 'auditSummary');
    }
  });

  if (!counts) fail('audit record stream has no auditSummary (incomplete report)');
  return { advisories, counts };
}

function parseNdjson(text) {
  return text
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(({ line }) => line !== '')
    .map(({ line, number }) => {
      try {
        return JSON.parse(line);
      } catch {
        return fail(`audit input is not valid JSON or NDJSON (line ${number})`);
      }
    });
}

export function parseAuditInput(raw) {
  const text = raw.trim();
  if (!text) fail('audit input is empty');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return readRecordStream(parseNdjson(text));
  }

  if (Array.isArray(parsed)) return readRecordStream(parsed);
  if (!isPlainObject(parsed)) fail(`audit input is not a report object: ${describe(parsed)}`);
  if (typeof parsed.type === 'string') return readRecordStream([parsed]);
  return readPnpmReport(parsed);
}
