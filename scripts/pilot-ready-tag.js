#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ARG_KEYS = {
  '--pilotId': 'pilotId',
  '--date': 'date',
  '--tagName': 'tagName',
};
const FIXED_GIT_EXECUTABLE_PATHS = ['/usr/bin/git', '/opt/homebrew/bin/git', '/usr/local/bin/git'];

function resolveGitExecutable() {
  const executable = FIXED_GIT_EXECUTABLE_PATHS.find(candidate => fs.existsSync(candidate));
  if (!executable) {
    throw new Error(`git executable was not found in ${FIXED_GIT_EXECUTABLE_PATHS.join(', ')}`);
  }
  return executable;
}

const GIT_EXECUTABLE = resolveGitExecutable();

function createArgParser(argKeys, createEmptyArgs) {
  return function parseArgs(argv) {
    const parsed = createEmptyArgs();

    for (let index = 0; index < argv.length; index += 1) {
      const token = argv[index];
      const next = argv[index + 1];

      if (token === '--help' || token === '-h') {
        parsed.help = true;
        break;
      }

      const key = argKeys[token];
      if (key && next) {
        parsed[key] = next;
        index += 1;
      }
    }

    return parsed;
  };
}

function runCli(main) {
  try {
    if (require.main === module) {
      main();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

function createEmptyArgs() {
  return {
    pilotId: '',
    date: '',
    tagName: '',
  };
}

const parseArgs = createArgParser(ARG_KEYS, createEmptyArgs);

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      const next = line[index + 1];
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
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

function legacyTimestampToIso(value) {
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(String(value || ''));
  if (!match) return '';
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
}

function upgradeLegacyPilotEvidenceRows(rows) {
  return rows.map(row => {
    if ('run_id' in row) {
      return {
        run_id: row.run_id || '',
        pilot_id: row.pilot_id || '',
        env_name: row.env_name || '',
        gate_suite: row.gate_suite || '',
        generated_at: row.generated_at || '',
        release_verdict: row.release_verdict || '',
        report_path: row.report_path || '',
        evidence_index_path: row.evidence_index_path || '',
        legacy_log_path: row.legacy_log_path || '',
      };
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

    return {
      run_id: row.run_id || '',
      pilot_id: row.pilot_id || '',
      env_name: row.env_name || '',
      gate_suite: row.gate_suite || '',
      generated_at: row.generated_at || '',
      release_verdict: row.release_verdict || '',
      report_path: row.report_path || '',
      evidence_index_path: row.evidence_index_path || '',
      legacy_log_path: row.legacy_log_path || '',
    };
  });
}

function printHelp() {
  console.log(
    [
      'Usage:',
      '  pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD> [--tagName <pilot-ready-YYYYMMDD>]',
      '',
      'Notes:',
      '  - Reuses docs/pilot-evidence/index.csv as the canonical pointer layer for pilot-entry evidence.',
      '  - Creates the canonical pilot-ready tag when missing, or verifies the existing tag against the same pilot-entry evidence when present.',
      '  - Requires the referenced release report and copied evidence index to exist in the current HEAD commit.',
    ].join('\n')
  );
}

function sanitizePilotId(value) {
  const safe = String(value || '')
    .trim()
    .replaceAll(/[^A-Za-z0-9._-]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '');
  if (!safe) {
    throw new Error('pilotId is required');
  }
  return safe;
}

function validateDate(value, label = 'date') {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${label} must use YYYY-MM-DD`);
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`${label} must use YYYY-MM-DD`);
  }
  return normalized;
}

function deriveTagName(date) {
  return `pilot-ready-${date.replaceAll('-', '')}`;
}

function validateTagName(value) {
  const normalized = String(value || '').trim();
  if (!/^pilot-ready-\d{8}$/.test(normalized)) {
    throw new Error('tagName must use pilot-ready-YYYYMMDD');
  }
  return normalized;
}

function readPointerRows(rootDir) {
  const pointerIndexPath = path.join(rootDir, 'docs', 'pilot-evidence', 'index.csv');
  if (!fs.existsSync(pointerIndexPath)) {
    throw new Error(
      'missing canonical pilot evidence pointer index: docs/pilot-evidence/index.csv'
    );
  }
  return upgradeLegacyPilotEvidenceRows(
    parsePilotEvidenceIndex(fs.readFileSync(pointerIndexPath, 'utf8'))
  );
}

function compareGeneratedAtDesc(left, right) {
  return String(right.generated_at || '').localeCompare(String(left.generated_at || ''));
}

function validateDocsPath(value, label, expectedPrefix) {
  const normalized = String(value || '')
    .trim()
    .replaceAll(path.sep, '/');
  if (
    !normalized.startsWith(expectedPrefix) ||
    normalized.includes('..') ||
    normalized.includes('\n') ||
    normalized.includes('\r')
  ) {
    throw new Error(`${label} must stay under ${expectedPrefix}`);
  }
  return normalized;
}

function git(rootDir, args) {
  return execFileSync(GIT_EXECUTABLE, args, { cwd: rootDir, encoding: 'utf8' }).trim();
}

function assertPathExistsInHead(rootDir, repoPath, label) {
  const filesystemPath = path.join(rootDir, repoPath);
  if (!fs.existsSync(filesystemPath)) {
    throw new Error(`${label} is missing from the worktree: ${repoPath}`);
  }
  try {
    execFileSync(GIT_EXECUTABLE, ['cat-file', '-e', `HEAD:${repoPath}`], {
      cwd: rootDir,
      stdio: 'ignore',
    });
  } catch {
    throw new Error(`${label} must be committed in HEAD before tagging: ${repoPath}`);
  }
}

function resolveCanonicalPilotEntry(args) {
  const rootDir = path.resolve(args.rootDir || path.join(__dirname, '..'));
  const pilotId = sanitizePilotId(args.pilotId);
  const expectedDate = validateDate(
    args.date || args.expectedDate,
    args.date ? 'date' : 'expectedDate'
  );
  const tagName = args.tagName ? validateTagName(args.tagName) : deriveTagName(expectedDate);
  const pointerRows = readPointerRows(rootDir);
  const pointerRow = [...pointerRows]
    .filter(
      row =>
        row.pilot_id === pilotId &&
        row.env_name === 'production' &&
        row.gate_suite === 'all' &&
        row.report_path &&
        row.evidence_index_path
    )
    .sort(compareGeneratedAtDesc)[0];

  if (!pointerRow) {
    throw new Error(`missing canonical pilot-entry artifact row for pilotId ${pilotId}`);
  }

  const evidenceDate = String(pointerRow.generated_at || '').slice(0, 10);
  if (evidenceDate !== expectedDate) {
    throw new Error(`pilot-ready tag evidence must match expected date ${expectedDate}`);
  }

  const reportPath = validateDocsPath(pointerRow.report_path, 'report_path', 'docs/release-gates/');
  const evidenceIndexPath = validateDocsPath(
    pointerRow.evidence_index_path,
    'evidence_index_path',
    'docs/pilot/'
  );

  assertPathExistsInHead(rootDir, reportPath, 'release report');
  assertPathExistsInHead(rootDir, evidenceIndexPath, 'copied evidence index');

  return {
    rootDir,
    pilotId,
    expectedDate,
    tagName,
    commitSha: git(rootDir, ['rev-parse', 'HEAD']),
    runId: String(pointerRow.run_id || ''),
    generatedAt: String(pointerRow.generated_at || ''),
    releaseVerdict: String(pointerRow.release_verdict || ''),
    reportPath,
    evidenceIndexPath,
  };
}

function buildTagMessage(entry) {
  return [
    `pilot-ready tag for ${entry.expectedDate}`,
    '',
    `pilot_id=${entry.pilotId}`,
    `date=${entry.expectedDate}`,
    `run_id=${entry.runId}`,
    `generated_at=${entry.generatedAt}`,
    `release_verdict=${entry.releaseVerdict}`,
    `report_path=${entry.reportPath}`,
    `evidence_index_path=${entry.evidenceIndexPath}`,
  ].join('\n');
}

function parseTagMessage(content) {
  return String(content || '')
    .split(/\r?\n/)
    .reduce((record, line) => {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex === -1) {
        return record;
      }
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (key) {
        record[key] = value;
      }
      return record;
    }, {});
}

function readExistingTag(rootDir, tagName) {
  try {
    execFileSync('git', ['show-ref', '--verify', '--quiet', `refs/tags/${tagName}`], {
      cwd: rootDir,
      stdio: 'ignore',
    });
    return {
      targetSha: git(rootDir, ['rev-list', '-n', '1', tagName]),
      metadata: parseTagMessage(git(rootDir, ['tag', '-l', '--format=%(contents)', tagName])),
    };
  } catch {
    return null;
  }
}

function verifyTagAgainstEntry(entry, existingTag) {
  if (!existingTag) {
    throw new Error(`missing pilot-ready tag: ${entry.tagName}`);
  }
  if (existingTag.targetSha !== entry.commitSha) {
    throw new Error(`pilot-ready tag ${entry.tagName} must point at HEAD ${entry.commitSha}`);
  }

  const expectedMetadata = {
    pilot_id: entry.pilotId,
    date: entry.expectedDate,
    run_id: entry.runId,
    generated_at: entry.generatedAt,
    release_verdict: entry.releaseVerdict,
    report_path: entry.reportPath,
    evidence_index_path: entry.evidenceIndexPath,
  };

  for (const [key, value] of Object.entries(expectedMetadata)) {
    if (existingTag.metadata[key] !== value) {
      throw new Error(`pilot-ready tag ${entry.tagName} metadata mismatch for ${key}`);
    }
  }

  return {
    tagName: entry.tagName,
    commitSha: entry.commitSha,
    pilotId: entry.pilotId,
    reportPath: entry.reportPath,
    evidenceIndexPath: entry.evidenceIndexPath,
    runId: entry.runId,
    mode: 'verified',
  };
}

function createPilotReadyTag(args) {
  const entry = resolveCanonicalPilotEntry(args);
  const existingTag = readExistingTag(entry.rootDir, entry.tagName);
  if (existingTag) {
    return verifyTagAgainstEntry(entry, existingTag);
  }

  execFileSync(
    GIT_EXECUTABLE,
    ['tag', '-a', entry.tagName, entry.commitSha, '-m', buildTagMessage(entry)],
    {
      cwd: entry.rootDir,
      stdio: 'ignore',
    }
  );

  return {
    tagName: entry.tagName,
    commitSha: entry.commitSha,
    pilotId: entry.pilotId,
    reportPath: entry.reportPath,
    evidenceIndexPath: entry.evidenceIndexPath,
    runId: entry.runId,
    mode: 'created',
  };
}

function verifyPilotReadyTag(args) {
  const entry = resolveCanonicalPilotEntry(args);
  return verifyTagAgainstEntry(entry, readExistingTag(entry.rootDir, entry.tagName));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const result = createPilotReadyTag({
    rootDir: path.resolve(__dirname, '..'),
    pilotId: args.pilotId,
    date: args.date,
    tagName: args.tagName,
  });

  console.log(`${result.mode === 'created' ? 'Tagged' : 'Verified'} ${result.tagName}`);
  console.log(`Commit: ${result.commitSha}`);
  console.log(`Release report path: ${result.reportPath}`);
  console.log(`Evidence index path: ${result.evidenceIndexPath}`);
}

runCli(main);

module.exports = {
  createEmptyArgs,
  createPilotReadyTag,
  deriveTagName,
  parseArgs,
  verifyPilotReadyTag,
};
