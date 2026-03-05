import fs from 'node:fs';
import path from 'node:path';

export const PROGRAM_PATH = path.resolve(process.cwd(), 'docs/plans/current-program.md');
export const TRACKER_PATH = path.resolve(process.cwd(), 'docs/plans/current-tracker.md');

export const ALLOWED_QUEUE_STATUSES = new Set(['completed', 'in_progress', 'pending', 'blocked']);
export const ALLOWED_EXECUTION_MODES = new Set([
  'manual',
  'scripted',
  'multi_agent',
  'pending',
  'blocked',
]);
export const ALLOWED_PROOF_STATUSES = new Set([
  'pass',
  'fail',
  'missing',
  'pending',
  'not_applicable',
]);

const SPECIAL_PROOF_VALUES = new Set(['missing', 'pending', 'blocked', 'not_applicable']);

export function readFileOrFail(filePath, commandName = 'plan:status') {
  if (!fs.existsSync(filePath)) {
    console.error(`${commandName} failed: missing ${filePath}`);
    process.exit(1);
  }

  return fs.readFileSync(filePath, 'utf8');
}

export function extractSection(text, heading) {
  const normalizedHeading = `## ${heading}`;
  const startIndex = text.search(new RegExp(`^${normalizedHeading}\\r?$`, 'm'));

  if (startIndex === -1) {
    return '';
  }

  const afterHeadingIndex = text.indexOf('\n', startIndex);

  if (afterHeadingIndex === -1) {
    return '';
  }

  const remainder = text.slice(afterHeadingIndex + 1);
  const nextHeadingMatch = remainder.match(/^## .*/m);
  const endIndex = nextHeadingMatch?.index ?? remainder.length;

  return remainder.slice(0, endIndex).trim();
}

function parseTableLine(line) {
  return line
    .split('|')
    .slice(1, -1)
    .map(cell => cell.trim());
}

function normalizeCell(value) {
  return value.replaceAll('`', '').trim();
}

function extractMarkdownTable(section) {
  const lines = section
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('|'));

  if (lines.length < 2) {
    return [];
  }

  const headers = parseTableLine(lines[0]).map(normalizeCell);
  const rows = [];

  for (const line of lines.slice(2)) {
    const cells = parseTableLine(line);

    if (cells.length !== headers.length) {
      continue;
    }

    const row = {};

    headers.forEach((header, index) => {
      row[header] = cells[index];
    });

    rows.push(row);
  }

  return rows;
}

export function splitListCell(value) {
  return value
    .split(';')
    .map(item => normalizeCell(item))
    .filter(Boolean);
}

export function extractQueueRows(text) {
  const section = extractSection(text, 'Active Queue');

  return extractMarkdownTable(section).map(row => ({
    id: normalizeCell(row.ID ?? ''),
    status: normalizeCell(row.Status ?? ''),
    owner: normalizeCell(row.Owner ?? ''),
    work: normalizeCell(row.Work ?? ''),
    exitCriteria: normalizeCell(row['Exit Criteria'] ?? ''),
  }));
}

export function extractProofRows(text) {
  const section = extractSection(text, 'Proof Ledger');

  return extractMarkdownTable(section).map(row => ({
    id: normalizeCell(row.ID ?? ''),
    sourceRefs: splitListCell(row['Source Refs'] ?? ''),
    execution: normalizeCell(row.Execution ?? ''),
    runId: normalizeCell(row['Run ID'] ?? ''),
    runRoot: normalizeCell(row['Run Root'] ?? ''),
    sonar: normalizeCell(row.Sonar ?? ''),
    docker: normalizeCell(row.Docker ?? ''),
    sentry: normalizeCell(row.Sentry ?? ''),
    learning: normalizeCell(row.Learning ?? ''),
    evidenceRefs: splitListCell(row['Evidence Refs'] ?? ''),
  }));
}

export function parseTrackerDocument(text) {
  return {
    queueRows: extractQueueRows(text),
    proofRows: extractProofRows(text),
  };
}

export function isSpecialProofValue(value) {
  return SPECIAL_PROOF_VALUES.has(value);
}

export function resolveRepoPath(root, repoPath) {
  return path.resolve(root, repoPath);
}
