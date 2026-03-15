const fs = require('node:fs');
const path = require('node:path');

const CANONICAL_PILOT_EVIDENCE_INDEX_COLUMNS = [
  'run_id',
  'pilot_id',
  'env_name',
  'gate_suite',
  'generated_at',
  'release_verdict',
  'report_path',
  'evidence_index_path',
  'legacy_log_path',
];

const CANONICAL_PILOT_EVIDENCE_TEMPLATE_PATH = 'docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md';
const CANONICAL_PILOT_EVIDENCE_POINTER_INDEX_PATH = 'docs/pilot-evidence/index.csv';
const CANONICAL_DAILY_EVIDENCE_HEADERS = [
  'Day',
  'Date (YYYY-MM-DD)',
  'Owner',
  'Status (`green`/`amber`/`red`)',
  'Release Report Path',
  'Evidence Bundle Path',
  'Incidents (count)',
  'Highest Sev (`none`/`sev3`/`sev2`/`sev1`)',
  'Decision (`continue`/`defer`/`hotfix`/`stop`)',
];
const CANONICAL_DAILY_EVIDENCE_SEPARATOR = [
  '---',
  '-----------------',
  '-----',
  '------------------------------',
  '-------------------',
  '--------------------',
  '-----------------',
  '-----------------------------------------',
  '---------------------------------------------',
];
const CANONICAL_DAILY_EVIDENCE_STATUS = new Set(['green', 'amber', 'red']);
const CANONICAL_DAILY_EVIDENCE_SEVERITY = new Set(['none', 'sev3', 'sev2', 'sev1']);
const CANONICAL_DAILY_EVIDENCE_DECISIONS = new Set(['continue', 'defer', 'hotfix', 'stop']);

function sanitizePilotId(value) {
  const safe = String(value || '')
    .trim()
    .replaceAll(/[^A-Za-z0-9._-]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '');
  if (!safe) {
    throw new Error('pilotId is required for pilot-entry artifacts');
  }
  return safe;
}

function formatRunId(generatedAt, pilotId) {
  const timestamp = new Date(generatedAt)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replaceAll(/[-:]/g, '');
  return `pilot-entry-${timestamp}-${sanitizePilotId(pilotId)}`;
}

function findRepoRootFromDocsPath(candidatePath) {
  const resolved = path.resolve(candidatePath);
  const marker = `${path.sep}docs${path.sep}`;
  const markerIndex = resolved.indexOf(marker);
  if (markerIndex === -1) {
    return path.dirname(resolved);
  }
  return resolved.slice(0, markerIndex);
}

function toRepoRelative(rootDir, targetPath) {
  const repoRelativePath = path
    .relative(rootDir, path.resolve(targetPath))
    .replaceAll(path.sep, '/');
  if (
    repoRelativePath.startsWith('../') ||
    repoRelativePath === '..' ||
    !repoRelativePath.startsWith('docs/')
  ) {
    throw new Error(`pilot artifact path must stay under docs/: ${repoRelativePath}`);
  }
  return repoRelativePath;
}

function assertCanonicalPilotEntryArgs(args) {
  if (args.envName !== 'production') {
    throw new Error('pilot-entry artifacts require envName "production"');
  }
  if (args.suite !== 'all') {
    throw new Error('pilot-entry artifacts require suite "all"');
  }
}

function assertCanonicalRepoPath(rootDir, targetPath, expectedRepoRelativePath, label) {
  const repoRelativePath = toRepoRelative(rootDir, targetPath);
  if (repoRelativePath !== expectedRepoRelativePath) {
    throw new Error(
      `${label} must be written to ${expectedRepoRelativePath}; received ${repoRelativePath}`
    );
  }
  return repoRelativePath;
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  values.push(current);
  return values;
}

function csvEscape(value) {
  const stringValue = String(value ?? '');
  if (!/[",\n]/.test(stringValue)) {
    return stringValue;
  }
  return `"${stringValue.replaceAll('"', '""')}"`;
}

function parsePilotEvidenceIndex(content) {
  const trimmed = String(content || '').trim();
  if (!trimmed) return [];

  const [headerLine, ...rowLines] = trimmed.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(headerLine);

  return rowLines.map(line => {
    const values = parseCsvLine(line);
    return header.reduce((record, column, index) => {
      record[column] = values[index] ?? '';
      return record;
    }, {});
  });
}

function upgradeLegacyPilotEvidenceRows(rows) {
  return rows.map(row => {
    if ('run_id' in row) {
      return CANONICAL_PILOT_EVIDENCE_INDEX_COLUMNS.reduce((record, column) => {
        record[column] = row[column] ?? '';
        return record;
      }, {});
    }

    if ('ts' in row) {
      return {
        run_id: row.ts || '',
        pilot_id: row.day || '',
        env_name: 'production',
        gate_suite: 'legacy',
        generated_at: legacyTimestampToIso(row.ts || ''),
        release_verdict: '',
        report_path: row.report_path || '',
        evidence_index_path: 'n/a',
        legacy_log_path: row.log_path || '',
      };
    }

    return CANONICAL_PILOT_EVIDENCE_INDEX_COLUMNS.reduce((record, column) => {
      record[column] = row[column] ?? '';
      return record;
    }, {});
  });
}

function legacyTimestampToIso(value) {
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(String(value || ''));
  if (!match) return '';
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
}

function serializePilotEvidenceIndex(rows) {
  const lines = [
    CANONICAL_PILOT_EVIDENCE_INDEX_COLUMNS.join(','),
    ...rows.map(row =>
      CANONICAL_PILOT_EVIDENCE_INDEX_COLUMNS.map(column => csvEscape(row[column] ?? '')).join(',')
    ),
  ];
  return `${lines.join('\n')}\n`;
}

function parseMarkdownTableRow(line) {
  if (!String(line).trim().startsWith('|')) {
    return null;
  }

  return String(line)
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(value => value.trim());
}

function stripParentheticalSegments(value) {
  let depth = 0;
  let result = '';

  for (const char of String(value || '')) {
    if (char === '(') {
      depth += 1;
      continue;
    }
    if (char === ')') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0) {
      result += char;
    }
  }

  return result;
}

function normalizeDailyHeader(header) {
  return stripParentheticalSegments(String(header || ''))
    .toLowerCase()
    .replaceAll('`', '')
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim();
}

function mapDailyHeaderToField(header) {
  const normalized = normalizeDailyHeader(header);
  if (normalized === 'day') return 'day';
  if (normalized === 'date') return 'date';
  if (normalized === 'owner') return 'owner';
  if (normalized === 'status') return 'status';
  if (normalized === 'release report path' || normalized === 'report path') return 'reportPath';
  if (normalized === 'evidence bundle path' || normalized === 'bundle path') return 'bundlePath';
  if (normalized === 'incidents' || normalized === 'incidents count') return 'incidentCount';
  if (normalized === 'highest sev' || normalized === 'highest severity') return 'highestSeverity';
  if (normalized === 'decision') return 'decision';
  return null;
}

function parseDailyEvidenceTable(content) {
  const lines = String(content || '').split(/\r?\n/);
  let headerIndex = -1;

  for (let index = 0; index < lines.length - 1; index += 1) {
    const cells = parseMarkdownTableRow(lines[index]);
    if (cells?.[0] !== 'Day') {
      continue;
    }
    const separator = parseMarkdownTableRow(lines[index + 1]);
    if (!separator) {
      continue;
    }
    headerIndex = index;
    break;
  }

  if (headerIndex === -1) {
    throw new Error('copied pilot evidence index must contain a daily evidence markdown table');
  }

  const headerCells = parseMarkdownTableRow(lines[headerIndex]);
  const fieldByIndex = headerCells.map(mapDailyHeaderToField);
  const rows = [];
  let rowStartIndex = headerIndex + 2;
  let rowEndIndex = rowStartIndex;

  while (rowEndIndex < lines.length) {
    const cells = parseMarkdownTableRow(lines[rowEndIndex]);
    if (!cells?.length || !/^\d+$/.test(cells[0] || '')) {
      break;
    }

    const row = {};
    for (let index = 0; index < cells.length; index += 1) {
      const field = fieldByIndex[index];
      if (field) {
        row[field] = cells[index];
      }
    }
    rows.push(row);
    rowEndIndex += 1;
  }

  return { headerIndex, rowEndIndex, rows, lines };
}

function serializeDailyEvidenceRow(row) {
  return [
    '|',
    ` ${row.day} `,
    '|',
    ` ${row.date || ''} `,
    '|',
    ` ${row.owner || ''} `,
    '|',
    ` ${row.status || ''} `,
    '|',
    ` ${row.reportPath || ''} `,
    '|',
    ` ${row.bundlePath || ''} `,
    '|',
    ` ${row.incidentCount || ''} `,
    '|',
    ` ${row.highestSeverity || ''} `,
    '|',
    ` ${row.decision || ''} `,
    '|',
  ].join('');
}

function buildCanonicalDailyEvidenceTable(existingRows, totalDays) {
  const rowsByDay = new Map(
    existingRows
      .map(row => {
        const day = Number.parseInt(String(row.day || ''), 10);
        if (!Number.isInteger(day) || day < 1) return null;
        return [
          day,
          {
            day,
            date: row.date || '',
            owner: row.owner || '',
            status: row.status || '',
            reportPath: row.reportPath || '',
            bundlePath: row.bundlePath || '',
            incidentCount: row.incidentCount || '',
            highestSeverity: row.highestSeverity || '',
            decision: row.decision || '',
          },
        ];
      })
      .filter(Boolean)
  );

  const tableLines = [
    `| ${CANONICAL_DAILY_EVIDENCE_HEADERS.join(' | ')} |`,
    `| ${CANONICAL_DAILY_EVIDENCE_SEPARATOR.join(' | ')} |`,
  ];

  for (let day = 1; day <= totalDays; day += 1) {
    const row = rowsByDay.get(day) || {
      day,
      date: '',
      owner: '',
      status: '',
      reportPath: '',
      bundlePath: '',
      incidentCount: '',
      highestSeverity: '',
      decision: '',
    };
    tableLines.push(serializeDailyEvidenceRow(row));
  }

  return tableLines;
}

function resolvePilotPointerRow(args) {
  const safePilotId = sanitizePilotId(args.pilotId);
  const existingRows = fs.existsSync(args.pilotEvidenceIndexCsvPath)
    ? upgradeLegacyPilotEvidenceRows(
        parsePilotEvidenceIndex(fs.readFileSync(args.pilotEvidenceIndexCsvPath, 'utf8'))
      )
    : [];

  const matchingRows = existingRows.filter(
    row =>
      row.pilot_id === safePilotId && row.evidence_index_path && row.evidence_index_path !== 'n/a'
  );

  if (!matchingRows.length) {
    throw new Error('pilot-entry artifact set must exist before daily evidence can be recorded');
  }

  return matchingRows.sort((left, right) => {
    const leftTime = Date.parse(left.generated_at || '');
    const rightTime = Date.parse(right.generated_at || '');
    return rightTime - leftTime;
  })[0];
}

function validateDailyDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    throw new Error('date must use YYYY-MM-DD format');
  }
  return String(value);
}

function validateMarkdownCellText(fieldName, value) {
  const normalized = String(value || '')
    .trim()
    .replaceAll(path.sep, '/');
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  if (/[|\r\n]/.test(normalized)) {
    throw new Error(`${fieldName} must not contain "|", carriage returns, or newlines`);
  }
  return normalized;
}

function validateReportPath(value) {
  const normalized = validateMarkdownCellText('reportPath', value);
  if (!normalized.startsWith('docs/release-gates/')) {
    throw new Error('reportPath must stay under docs/release-gates/');
  }
  if (normalized.split('/').includes('..')) {
    throw new Error('reportPath must stay under docs/release-gates/ without ".." segments');
  }
  return normalized;
}

function validateBundlePath(value) {
  return validateMarkdownCellText('bundlePath', value);
}

function ensureCopiedPilotEvidenceIndex(args) {
  const {
    rootDir,
    pilotId,
    runId,
    generatedAt,
    reportPath,
    releaseVerdict,
    releaseGateTemplatePath,
  } = args;
  const safePilotId = sanitizePilotId(pilotId);
  const destinationPath = path.join(
    rootDir,
    'docs',
    'pilot',
    `PILOT_EVIDENCE_INDEX_${safePilotId}.md`
  );

  if (fs.existsSync(destinationPath)) {
    return destinationPath;
  }

  const templateContent = fs.readFileSync(releaseGateTemplatePath, 'utf8').trim();
  const reportPathRelative = toRepoRelative(rootDir, reportPath);
  const templatePathRelative = toRepoRelative(rootDir, releaseGateTemplatePath);
  const preamble = [
    `# Pilot Evidence Index — ${safePilotId}`,
    '',
    `Copied from \`${templatePathRelative}\` by pilot-entry run \`${runId}\`.`,
    '',
    `- Pilot ID: \`${safePilotId}\``,
    `- Created at: \`${new Date(generatedAt).toISOString()}\``,
    `- Release gate report: \`${reportPathRelative}\``,
    `- Release verdict: \`${releaseVerdict}\``,
    '',
    'Populate the daily rows below during pilot operation. Keep the copied file path stable for this pilot ID.',
    '',
  ].join('\n');

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, `${preamble}${templateContent}\n`, 'utf8');
  return destinationPath;
}

function appendPilotEvidencePointerRow(args) {
  const {
    rootDir,
    runId,
    pilotId,
    envName,
    suite,
    generatedAt,
    releaseVerdict,
    reportPath,
    evidenceIndexPath,
    pilotEvidenceIndexCsvPath,
  } = args;

  const existingRows = fs.existsSync(pilotEvidenceIndexCsvPath)
    ? upgradeLegacyPilotEvidenceRows(
        parsePilotEvidenceIndex(fs.readFileSync(pilotEvidenceIndexCsvPath, 'utf8'))
      )
    : [];

  const nextRow = {
    run_id: runId,
    pilot_id: sanitizePilotId(pilotId),
    env_name: envName,
    gate_suite: suite,
    generated_at: new Date(generatedAt).toISOString(),
    release_verdict: releaseVerdict,
    report_path: toRepoRelative(rootDir, reportPath),
    evidence_index_path: toRepoRelative(rootDir, evidenceIndexPath),
    legacy_log_path: '',
  };

  const mergedRows = existingRows.filter(row => row.run_id !== runId);
  mergedRows.push(nextRow);
  fs.mkdirSync(path.dirname(pilotEvidenceIndexCsvPath), { recursive: true });
  fs.writeFileSync(pilotEvidenceIndexCsvPath, serializePilotEvidenceIndex(mergedRows), 'utf8');
  return nextRow;
}

function createPilotEntryArtifacts(args) {
  const reportPath = path.resolve(args.reportPath);
  const rootDir = path.resolve(args.rootDir || findRepoRootFromDocsPath(reportPath));
  assertCanonicalPilotEntryArgs(args);
  const releaseGateTemplatePath = path.resolve(
    args.releaseGateTemplatePath ||
      path.join(rootDir, 'docs', 'pilot', 'PILOT_EVIDENCE_INDEX_TEMPLATE.md')
  );
  const pilotEvidenceIndexCsvPath = path.resolve(
    args.pilotEvidenceIndexCsvPath || path.join(rootDir, 'docs', 'pilot-evidence', 'index.csv')
  );
  assertCanonicalRepoPath(
    rootDir,
    releaseGateTemplatePath,
    CANONICAL_PILOT_EVIDENCE_TEMPLATE_PATH,
    'pilot-entry evidence template'
  );
  assertCanonicalRepoPath(
    rootDir,
    pilotEvidenceIndexCsvPath,
    CANONICAL_PILOT_EVIDENCE_POINTER_INDEX_PATH,
    'pilot-entry pointer rows'
  );
  const generatedAt = new Date(args.generatedAt || new Date());
  const runId = formatRunId(generatedAt, args.pilotId);

  const evidenceIndexPath = ensureCopiedPilotEvidenceIndex({
    rootDir,
    pilotId: args.pilotId,
    runId,
    generatedAt,
    reportPath,
    releaseVerdict: args.releaseVerdict,
    releaseGateTemplatePath,
  });

  const pointerRow = appendPilotEvidencePointerRow({
    rootDir,
    runId,
    pilotId: args.pilotId,
    envName: args.envName,
    suite: args.suite,
    generatedAt,
    releaseVerdict: args.releaseVerdict,
    reportPath,
    evidenceIndexPath,
    pilotEvidenceIndexCsvPath,
  });

  return {
    runId,
    evidenceIndexPath,
    pointerRow,
    pilotEvidenceIndexCsvPath,
  };
}

function recordPilotDailyEvidence(args) {
  const rootDir = path.resolve(
    args.rootDir || findRepoRootFromDocsPath(args.pilotEvidenceIndexCsvPath || process.cwd())
  );
  const pilotEvidenceIndexCsvPath = path.resolve(
    args.pilotEvidenceIndexCsvPath || path.join(rootDir, 'docs', 'pilot-evidence', 'index.csv')
  );
  assertCanonicalRepoPath(
    rootDir,
    pilotEvidenceIndexCsvPath,
    CANONICAL_PILOT_EVIDENCE_POINTER_INDEX_PATH,
    'pilot-entry pointer rows'
  );

  const pointerRow = resolvePilotPointerRow({
    pilotId: args.pilotId,
    pilotEvidenceIndexCsvPath,
  });
  const evidenceIndexPath = path.resolve(rootDir, pointerRow.evidence_index_path);
  if (!fs.existsSync(evidenceIndexPath)) {
    throw new Error('pilot-entry artifact set must exist before daily evidence can be recorded');
  }

  const day = Number.parseInt(String(args.day || ''), 10);
  if (!Number.isInteger(day) || day < 1) {
    throw new Error('day must be a positive integer');
  }

  const status = String(args.status || '')
    .trim()
    .toLowerCase();
  if (!CANONICAL_DAILY_EVIDENCE_STATUS.has(status)) {
    throw new Error('status must be one of green, amber, or red');
  }

  const highestSeverity = String(args.highestSeverity || '')
    .trim()
    .toLowerCase();
  if (!CANONICAL_DAILY_EVIDENCE_SEVERITY.has(highestSeverity)) {
    throw new Error('highestSeverity must be one of none, sev3, sev2, or sev1');
  }

  const decision = String(args.decision || '')
    .trim()
    .toLowerCase();
  if (!CANONICAL_DAILY_EVIDENCE_DECISIONS.has(decision)) {
    throw new Error('decision must be one of continue, defer, hotfix, or stop');
  }

  const incidentCount = Number.parseInt(String(args.incidentCount ?? ''), 10);
  if (!Number.isInteger(incidentCount) || incidentCount < 0) {
    throw new Error('incidentCount must be a non-negative integer');
  }

  const owner = validateMarkdownCellText('owner', args.owner);

  const parsedTable = parseDailyEvidenceTable(fs.readFileSync(evidenceIndexPath, 'utf8'));
  const reportPath = validateReportPath(args.reportPath || pointerRow.report_path);
  const nextRows = parsedTable.rows.map(row => ({ ...row }));
  const nextRow = {
    day,
    date: validateDailyDate(args.date),
    owner,
    status,
    reportPath,
    bundlePath: validateBundlePath(args.bundlePath),
    incidentCount: String(incidentCount),
    highestSeverity,
    decision,
  };
  const existingIndex = nextRows.findIndex(row => Number.parseInt(row.day, 10) === day);

  if (existingIndex === -1) {
    nextRows.push(nextRow);
  } else {
    nextRows[existingIndex] = nextRow;
  }

  const totalDays = Math.max(parsedTable.rows.length || 0, day);
  const nextTableLines = buildCanonicalDailyEvidenceTable(nextRows, totalDays);
  const nextLines = [...parsedTable.lines];
  nextLines.splice(
    parsedTable.headerIndex,
    parsedTable.rowEndIndex - parsedTable.headerIndex,
    ...nextTableLines
  );
  fs.writeFileSync(evidenceIndexPath, `${nextLines.join('\n').trimEnd()}\n`, 'utf8');

  return {
    evidenceIndexPath,
    reportPath,
    pointerRow,
  };
}

module.exports = {
  CANONICAL_DAILY_EVIDENCE_DECISIONS,
  CANONICAL_DAILY_EVIDENCE_HEADERS,
  CANONICAL_DAILY_EVIDENCE_SEVERITY,
  CANONICAL_DAILY_EVIDENCE_STATUS,
  CANONICAL_PILOT_EVIDENCE_INDEX_COLUMNS,
  CANONICAL_PILOT_EVIDENCE_POINTER_INDEX_PATH,
  CANONICAL_PILOT_EVIDENCE_TEMPLATE_PATH,
  createPilotEntryArtifacts,
  parsePilotEvidenceIndex,
  recordPilotDailyEvidence,
  serializePilotEvidenceIndex,
  upgradeLegacyPilotEvidenceRows,
};
