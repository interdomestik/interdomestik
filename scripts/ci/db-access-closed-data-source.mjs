import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { runGit } from './db-access-git.mjs';
import { CLOSED_DATA_BOUNDARY } from './db-access-closed-data-policy.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const key = row => JSON.stringify([row.file, row.reason]);
const expected = new Map(CLOSED_DATA_BOUNDARY.diagnostics.map(row => [key(row), row.occurrences]));
const files = new Set(CLOSED_DATA_BOUNDARY.files.map(row => row.file));
const policySha256 = digest(JSON.stringify(CLOSED_DATA_BOUNDARY));

function importsMatch(source, permitted) {
  const parsed = ts.createSourceFile('boundary.ts', source, ts.ScriptTarget.Latest, true);
  if (parsed.parseDiagnostics.length) return false;
  const imports = [];
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (
      statement.importClause?.isTypeOnly ||
      statement.importClause?.name ||
      !bindings ||
      !ts.isNamedImports(bindings) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    )
      return false;
    imports.push({
      module: statement.moduleSpecifier.text,
      names: bindings.elements.map(item => [
        item.propertyName?.text ?? item.name.text,
        item.name.text,
      ]),
    });
  }
  return JSON.stringify(imports) === JSON.stringify(permitted);
}

function authenticatePair(repoRoot, model) {
  const root = fs.realpathSync(repoRoot);
  const listing = runGit(['-C', root, 'ls-tree', '-rz', 'HEAD', '--', ...files])
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  const blobs = new Map(
    listing.map(row => {
      const [metadata, file] = row.split('\t');
      const [mode, kind, oid] = metadata.split(' ');
      return [file, { mode, kind, oid }];
    })
  );
  for (const reviewed of CLOSED_DATA_BOUNDARY.files) {
    const full = path.join(root, reviewed.file);
    const stat = fs.lstatSync(full);
    const blob = blobs.get(reviewed.file);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o111) !== 0 ||
      fs.realpathSync(full) !== full ||
      stat.size !== reviewed.bytes ||
      blob?.mode !== '100644' ||
      blob.kind !== 'blob'
    )
      return false;
    const bytes = fs.readFileSync(full);
    const committed = runGit(['-C', root, 'cat-file', 'blob', blob.oid]);
    if (
      digest(bytes) !== reviewed.sha256 ||
      digest(committed) !== reviewed.sha256 ||
      model.sources.get(reviewed.file) !== bytes.toString('utf8') ||
      !importsMatch(bytes.toString('utf8'), reviewed.imports)
    )
      return false;
  }
  return true;
}

// A G-owned review of two exact closed-data bodies resolves only its enumerated witnesses.
// Inventory and ordinary graph traversal happen first. This grants no DB or runtime-test credit.
export function qualifyClosedDataBoundary(repoRoot, model, inventory, graph) {
  const raw = graph.incomplete;
  const qualification = {
    id: CLOSED_DATA_BOUNDARY.id,
    policySha256,
    status: 'unqualified',
    files: CLOSED_DATA_BOUNDARY.files.map(({ file, bytes, sha256 }) => ({
      file,
      mode: '100644',
      bytes,
      sha256,
    })),
    resolvedDiagnostics: [],
    resolvedRawCount: 0,
  };
  const result = { qualification, unresolvedIncomplete: raw };
  const present = [...files].filter(file => model.sources.has(file));
  if (!present.length)
    return { ...result, qualification: { ...qualification, status: 'not-applicable' } };
  if (present.length !== files.size) return result;
  // No operation, including a DB-looking mock, may be hidden by the closed-data boundary.
  if (inventory.entries.some(entry => files.has(entry.file))) return result;
  try {
    if (!authenticatePair(repoRoot, model)) return result;
  } catch {
    return result;
  }
  const selected = raw.filter(row => files.has(row.file));
  if (
    selected.length !== expected.size ||
    new Set(selected.map(key)).size !== expected.size ||
    selected.some(row => expected.get(key(row)) !== row.occurrences)
  )
    return result;
  return {
    qualification: {
      ...qualification,
      status: 'qualified',
      resolvedDiagnostics: selected,
      resolvedRawCount: selected.reduce((sum, row) => sum + row.occurrences, 0),
    },
    unresolvedIncomplete: raw.filter(row => !files.has(row.file)),
  };
}
