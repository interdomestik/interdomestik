import path from 'node:path';
import { libCoverage } from './libraries.mjs';
import { captureOrdinarySignedElseResidual } from './ordinary-coverage-domain.mjs';

const fail = reason => {
  throw Error('P2 ordinary coverage incomplete: ' + reason);
};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sameKeys = (value, keys) =>
  object(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const count = value => Number.isSafeInteger(value) && value >= 0;
const line = value => Number.isSafeInteger(value) && value > 0;
const metrics = ['lines', 'statements', 'functions', 'branches'];

function location(value) {
  if (!sameKeys(value, ['start', 'end'])) fail('location shape');
  for (const side of ['start', 'end']) {
    const point = value[side];
    if (
      !sameKeys(point, ['line', 'column']) ||
      !line(point.line) ||
      !(count(point.column) || (side === 'end' && point.column === null))
    )
      fail('location position');
  }
  if (
    value.end.line < value.start.line ||
    (value.end.line === value.start.line &&
      value.end.column !== null &&
      value.end.column < value.start.column)
  )
    fail('reversed location');
}

// Validate complete Istanbul geometry/counter joins before the library can merge
// or silently normalize data. End-column null is the real OXC JSON sentinel.
export function validateOrdinaryGeometry(row, context = {}) {
  if (!object(row) || typeof row.path !== 'string') fail('file shape');
  const fields = new Set([
    'path',
    'statementMap',
    'fnMap',
    'branchMap',
    's',
    'f',
    'b',
    'bT',
    'meta',
    'all',
    'hash',
    'inputSourceMap',
    '_coverageSchema',
  ]);
  if (Object.keys(row).some(key => !fields.has(key))) fail('foreign file field');
  for (const [mapKey, countKey] of [
    ['statementMap', 's'],
    ['fnMap', 'f'],
    ['branchMap', 'b'],
  ]) {
    const geometry = row[mapKey],
      counters = row[countKey];
    if (
      !object(geometry) ||
      !sameKeys(counters, Object.keys(geometry)) ||
      Object.keys(geometry).some(id => !/^(0|[1-9][0-9]*)$/u.test(id))
    )
      fail('geometry/counter identity');
    for (const [id, item] of Object.entries(geometry)) {
      if (mapKey === 'statementMap') location(item);
      if (mapKey === 'fnMap') {
        if (
          !object(item) ||
          typeof item.name !== 'string' ||
          !sameKeys(item, [
            'name',
            'decl',
            'loc',
            ...(Object.hasOwn(item, 'line') ? ['line'] : []),
          ]) ||
          (Object.hasOwn(item, 'line') && !line(item.line))
        )
          fail('function geometry');
        location(item.decl);
        location(item.loc);
      }
      if (mapKey === 'branchMap') {
        if (
          !object(item) ||
          typeof item.type !== 'string' ||
          !item.type ||
          !sameKeys(item, [
            'type',
            'loc',
            'locations',
            ...(Object.hasOwn(item, 'line') ? ['line'] : []),
          ]) ||
          (Object.hasOwn(item, 'line') && !line(item.line)) ||
          !Array.isArray(item.locations) ||
          !item.locations.length
        )
          fail('branch geometry');
        location(item.loc);
        item.locations.forEach((value, index) => {
          // Istanbul/OXC represents an implicit else with two empty positions.
          // It is still a counted branch, never an omitted geometry/counter row.
          const implicitElse =
            item.type === 'if' &&
            index === 1 &&
            item.locations.length === 2 &&
            sameKeys(value, ['start', 'end']) &&
            sameKeys(value.start, []) &&
            sameKeys(value.end, []);
          if (!implicitElse) location(value);
        });
        if (!Array.isArray(counters[id]) || counters[id].length !== item.locations.length)
          fail('branch counters');
        if (counters[id].some(value => !count(value)))
          captureOrdinarySignedElseResidual(row, id, context);
      } else if (!count(counters[id])) fail('counter');
    }
  }
  if (Object.hasOwn(row, 'bT')) {
    if (!sameKeys(row.bT, Object.keys(row.branchMap))) fail('true-branch identity');
    for (const [id, values] of Object.entries(row.bT))
      if (
        !Array.isArray(values) ||
        values.length !== row.b[id].length ||
        values.some(v => !count(v))
      )
        fail('true-branch counters');
  }
}

function assertSummary(actual, expected) {
  if (
    !sameKeys(actual, [
      ...metrics,
      ...(Object.hasOwn(actual ?? {}, 'branchesTrue') ? ['branchesTrue'] : []),
    ])
  )
    fail('summary metric identity');
  for (const metric of Object.keys(actual)) {
    const value = actual[metric],
      wanted = expected[metric];
    if (
      !sameKeys(value, ['total', 'covered', 'skipped', 'pct']) ||
      !wanted ||
      ![value.total, value.covered, value.skipped].every(count) ||
      ['total', 'covered', 'skipped'].some(key => value[key] !== wanted[key])
    )
      fail('summary/map totals ' + metric);
    const validEmpty =
      wanted.total === 0 &&
      wanted.covered === 0 &&
      wanted.skipped === 0 &&
      (value.pct === 0 || value.pct === 100 || value.pct === 'Unknown');
    if (!validEmpty && value.pct !== wanted.pct) fail('summary/map percentage ' + metric);
  }
}

export function reconcileOrdinaryWebSummary({
  coverage,
  summary,
  candidateRoot,
  trackedSourceEntries,
  ordinaryArtifactIdentity,
}) {
  const entries = Object.entries(coverage);
  const relativeFiles = entries.map(([file]) => path.relative(candidateRoot, file));
  if (!sameKeys(summary, ['total', ...relativeFiles])) fail('summary/map file identity');
  for (const [file, row] of entries) {
    if (row.path !== file) fail('source path identity');
    validateOrdinaryGeometry(row, {
      candidateRoot,
      trackedSourceEntries,
      ordinaryArtifactIdentity,
    });
    assertSummary(
      summary[path.relative(candidateRoot, file)],
      libCoverage.createFileCoverage(row).toSummary().toJSON()
    );
  }
  const map = libCoverage.createCoverageMap(coverage);
  assertSummary(summary.total, map.getCoverageSummary().toJSON());
  return { total: structuredClone(summary.total) };
}
