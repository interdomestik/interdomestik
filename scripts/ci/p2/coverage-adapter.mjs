import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { convert, parseAstAsync, libCoverage, libReport, reports } from './libraries.mjs';
import ordinaryDenominator from './dist/ordinary-denominator.json' with { type: 'json' };
import { composeP2Mapping, compile, sha } from './compose-mapping.mjs';
const converted = new WeakSet();
const sourceTexts = new WeakMap();
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const fail = reason => {
  throw Error('P2 coverage rejected: ' + reason);
};
const sorted = values => values.map(x => JSON.stringify(x)).sort();
const geometry = file => ({
  statements: sorted(Object.values(file.statementMap)),
  functions: sorted(Object.values(file.fnMap)),
  branches: sorted(Object.values(file.branchMap)),
});

// Pure conversion only. Fresh-run authority belongs to protected dispatch, not to
// observation JSON, ambient coverage, this module's brand, or a generated report.
export async function convertP2Coverage({
  observation,
  generatedJs,
  generatedTs,
  sourceMap,
  originalSource,
  retainedSegments,
  originalPath,
}) {
  if (!path.isAbsolute(originalPath)) fail('original path must be canonical absolute path');
  const input = observation?.coverage;
  if (
    observation.kind !== 'untrusted-wrapper-observations-v2' ||
    input?.version !== 1 ||
    input.url !== 'file:///capsule/wrapper.mjs' ||
    input.sourceSha256 !== sha(generatedJs) ||
    !Array.isArray(input.functions) ||
    !input.functions.length
  )
    fail('capture identity');
  const mapping = await composeP2Mapping({
    generatedJs,
    generatedTs,
    sourceMap,
    originalSource,
    retainedSegments,
    originalPath,
  });
  const expectedFunctions = new Set(['0:' + generatedJs.length]);
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (
      ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)
    )
      expectedFunctions.add(node.start + ':' + node.end);
    for (const value of Object.values(node))
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
  }
  visit(mapping.ast);
  const observedFunctions = new Set();
  for (const fn of input.functions) {
    if (
      typeof fn.functionName !== 'string' ||
      typeof fn.isBlockCoverage !== 'boolean' ||
      !Array.isArray(fn.ranges) ||
      !fn.ranges.length
    )
      fail('function range shape');
    const identity = fn.ranges[0].startOffset + ':' + fn.ranges[0].endOffset;
    if (!expectedFunctions.has(identity) || observedFunctions.has(identity))
      fail('foreign or duplicate function coverage');
    observedFunctions.add(identity);
    for (let index = 0; index < fn.ranges.length; index++) {
      const range = fn.ranges[index];
      if (
        ![range.startOffset, range.endOffset, range.count].every(Number.isSafeInteger) ||
        range.startOffset < 0 ||
        range.endOffset > generatedJs.length ||
        range.endOffset <= range.startOffset ||
        range.count < 0
      )
        fail('range outside exact source');
      if (range.startOffset < fn.ranges[0].startOffset || range.endOffset > fn.ranges[0].endOffset)
        fail('block escapes owning function');
      const root =
        index === 0 &&
        fn.functionName === '' &&
        range.startOffset === 0 &&
        range.endOffset === generatedJs.length;
      if (!root && (!mapping.mapped(range.startOffset) || !mapping.mapped(range.endOffset - 1)))
        fail('unmapped non-root coverage range');
    }
  }
  if (observedFunctions.size !== expectedFunctions.size)
    fail('missing function coverage; zero-count functions must remain explicit');
  const original = compile(originalSource, originalPath);
  const structural = value =>
    Array.isArray(value)
      ? value.map(structural)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .filter(([key]) => !['start', 'end', 'loc', 'raw'].includes(key))
              .map(([key, v]) => [key, structural(v)])
          )
        : value;
  if (
    sha(originalSource) !== ordinaryDenominator.originalSourceSha256 ||
    !originalPath.endsWith('/' + ordinaryDenominator.originalRelativePath) ||
    sha(JSON.stringify(structural(await parseAstAsync(original.outputText)))) !==
      ordinaryDenominator.semanticAstSha256
  )
    fail('sealed ordinary source/AST identity');
  const originalMap = JSON.parse(original.sourceMapText);
  originalMap.sources = [originalPath];
  originalMap.sourcesContent = [originalSource];
  const denominator = await convert({
    code: original.outputText,
    ast: parseAstAsync(original.outputText),
    sourceMap: originalMap,
    coverage: { url: pathToFileURL(originalPath + '.denominator.js').href, functions: [] },
    wrapperLength: 0,
  });
  const actual = await convert({
    code: generatedJs,
    ast: mapping.ast,
    sourceMap: mapping.map,
    coverage: { url: input.url, functions: input.functions },
    wrapperLength: 0,
    ignoreNode: mapping.ignoreNode,
  });
  if (Object.keys(actual).length !== 1 || !actual[originalPath] || !denominator[originalPath])
    fail('foreign/missing original file');
  if (
    JSON.stringify(geometry(actual[originalPath])) !==
    JSON.stringify(geometry(denominator[originalPath]))
  )
    fail('original source denominator geometry differs');
  // The sealed descriptor is built from the real ordinary OXC transform only
  // after exact structural equality with the original TS compiler AST. The same
  // converter/version visits identical nodes in identical order; no counts are
  // inferred. Runtime also checks full TS geometry and original source/AST hash.
  const file = actual[originalPath];
  for (const [mapKey, countKey] of [
    ['statementMap', 's'],
    ['fnMap', 'f'],
    ['branchMap', 'b'],
  ]) {
    if (
      JSON.stringify(Object.keys(file[mapKey])) !==
      JSON.stringify(Object.keys(ordinaryDenominator[mapKey]))
    )
      fail('ordinary denominator identity');
    if (countKey === 'b')
      for (const id of Object.keys(file.b))
        if (file.b[id].length !== ordinaryDenominator.branchMap[id].locations.length)
          fail('ordinary branch cardinality');
    file[mapKey] = structuredClone(ordinaryDenominator[mapKey]);
  }
  const result = freeze({
    coverageMap: actual,
    originalPath,
    originalSourceSha256: sha(originalSource),
    generatedSourceSha256: sha(generatedJs),
    composedMap: mapping.map,
    denominator: geometry(actual[originalPath]),
    scaffoldRanges: mapping.scaffold,
    runtimeAdmission: false,
    proofMinted: false,
  });
  converted.add(result);
  sourceTexts.set(result, originalSource);
  return result;
}

export function mergeP2Coverage({ ambientCoverage, p2Coverage, outputDirectory }) {
  if (!converted.has(p2Coverage))
    fail('coverage must be converted in this process; this is not run authority');
  const candidateRoot = p2Coverage.originalPath.slice(
    0,
    -ordinaryDenominator.originalRelativePath.length - 1
  );
  const merged = libCoverage.createCoverageMap(ambientCoverage ?? {});
  for (const file of merged.files()) {
    if (
      file !== p2Coverage.originalPath &&
      (!file.startsWith(candidateRoot + '/') || !/\.[cm]?[jt]sx?$/u.test(file))
    )
      fail('ambient report source outside fixed repository');
    const coverage = merged.fileCoverageFor(file).toJSON();
    if (coverage.path !== file) fail('ambient source path identity');
    const counts = [
      ...Object.values(coverage.s),
      ...Object.values(coverage.f),
      ...Object.values(coverage.b).flat(),
    ];
    if (counts.some(count => !Number.isSafeInteger(count) || count < 0))
      fail('invalid ambient counts');
  }
  if (
    merged.files().includes(p2Coverage.originalPath) &&
    JSON.stringify(geometry(merged.fileCoverageFor(p2Coverage.originalPath).toJSON())) !==
      JSON.stringify(p2Coverage.denominator)
  )
    fail('ambient original denominator mismatch');
  // Ordinary coverage is untrusted report input. It can never contribute target
  // counts; only the fresh capsule conversion supplies this file's coverage.
  merged.filter(file => file !== p2Coverage.originalPath);
  merged.merge(p2Coverage.coverageMap);
  if (
    JSON.stringify(geometry(merged.fileCoverageFor(p2Coverage.originalPath).toJSON())) !==
    JSON.stringify(p2Coverage.denominator)
  )
    fail('merge changed original denominator');
  if (!path.isAbsolute(outputDirectory) || fs.existsSync(outputDirectory))
    fail('fresh absolute output directory required');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const context = libReport.createContext({
    dir: outputDirectory,
    coverageMap: merged,
    sourceFinder: file => {
      if (file === p2Coverage.originalPath) return sourceTexts.get(p2Coverage);
      if (fs.realpathSync(file) !== file) fail('ambient report source symlink');
      return fs.readFileSync(file, 'utf8');
    },
  });
  for (const name of ['json', 'json-summary', 'lcovonly', 'html', 'text-summary'])
    reports.create(name).execute(context);
  return {
    files: merged.files(),
    coverageMap: JSON.parse(JSON.stringify(merged.toJSON())),
    summary: merged.getCoverageSummary().toJSON(),
    outputDirectory,
    runtimeAdmission: false,
    proofMinted: false,
  };
}
