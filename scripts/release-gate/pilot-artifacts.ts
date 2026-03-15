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

function sanitizePilotId(value) {
  const safe = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!safe) {
    throw new Error('pilotId is required for pilot-entry artifacts');
  }
  return safe;
}

function formatRunId(generatedAt, pilotId) {
  const timestamp = new Date(generatedAt).toISOString().replace(/[-:]/g, '').replace('.000Z', 'Z');
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
  return path.relative(rootDir, path.resolve(targetPath)).replaceAll(path.sep, '/');
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
  return `"${stringValue.replace(/"/g, '""')}"`;
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
  const releaseGateTemplatePath = path.resolve(
    args.releaseGateTemplatePath ||
      path.join(rootDir, 'docs', 'pilot', 'PILOT_EVIDENCE_INDEX_TEMPLATE.md')
  );
  const pilotEvidenceIndexCsvPath = path.resolve(
    args.pilotEvidenceIndexCsvPath || path.join(rootDir, 'docs', 'pilot-evidence', 'index.csv')
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

module.exports = {
  CANONICAL_PILOT_EVIDENCE_INDEX_COLUMNS,
  createPilotEntryArtifacts,
  parsePilotEvidenceIndex,
  serializePilotEvidenceIndex,
  upgradeLegacyPilotEvidenceRows,
};
