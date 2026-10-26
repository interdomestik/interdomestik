import { createHash } from 'node:crypto';
import { ts, trace, gen, parseAstAsync } from './libraries.mjs';
export const sha = value => createHash('sha256').update(value).digest('hex');
const fail = reason => {
  throw Error('P2 coverage mapping rejected: ' + reason);
};
export function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return {
    offset(line, column) {
      if (
        !Number.isInteger(line) ||
        line < 1 ||
        line > starts.length ||
        !Number.isInteger(column) ||
        column < 0
      )
        fail('invalid source position');
      const offset = starts[line - 1] + column;
      if (offset > text.length || (line < starts.length && offset >= starts[line]))
        fail('source column outside line');
      return offset;
    },
    position(offset) {
      if (!Number.isInteger(offset) || offset < 0 || offset > text.length)
        fail('invalid source offset');
      let lo = 0,
        hi = starts.length;
      while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1;
        if (starts[mid] <= offset) lo = mid;
        else hi = mid;
      }
      return { line: lo + 1, column: offset - starts[lo] };
    },
  };
}
export const compile = (source, fileName) =>
  ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      sourceMap: true,
      inlineSources: true,
    },
    reportDiagnostics: true,
  });

export async function composeP2Mapping({
  generatedJs,
  generatedTs,
  sourceMap,
  originalSource,
  retainedSegments,
  originalPath,
}) {
  const raw = typeof sourceMap === 'string' ? JSON.parse(sourceMap) : sourceMap;
  const compiled = compile(generatedTs, 'wrapper.source.ts');
  const emitted = JSON.parse(compiled.sourceMapText);
  if (
    compiled.diagnostics?.some(x => x.category === ts.DiagnosticCategory.Error) ||
    compiled.outputText !== generatedJs
  )
    fail('generated JavaScript/compiler mismatch');
  if (
    raw.version !== 3 ||
    raw.mappings !== emitted.mappings ||
    JSON.stringify(raw.sourcesContent) !== JSON.stringify([generatedTs]) ||
    JSON.stringify(raw.sources) !== JSON.stringify(emitted.sources)
  )
    fail('generated source-map identity');
  const segments = retainedSegments
    .filter(s => s.file === originalPath || originalPath.endsWith('/' + s.file))
    .sort((a, b) => a.generatedStart - b.generatedStart);
  const originalAst = ts.createSourceFile(
    originalPath,
    originalSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const expected = originalAst.statements
    .filter(n => !ts.isImportDeclaration(n))
    .map(n => [n.getStart(originalAst), n.end]);
  if (
    JSON.stringify(segments.map(s => [s.start, s.end]).sort((a, b) => a[0] - b[0])) !==
    JSON.stringify(expected)
  )
    fail('retained segments omit original executable/type source');
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (
      ![s.start, s.end, s.generatedStart, s.generatedEnd].every(Number.isSafeInteger) ||
      s.end <= s.start ||
      s.generatedEnd - s.generatedStart !== s.end - s.start ||
      s.start < 0 ||
      s.end > originalSource.length ||
      s.generatedStart < 0 ||
      s.generatedEnd > generatedTs.length ||
      (i && segments[i - 1].generatedEnd > s.generatedStart)
    )
      fail('retained segment bounds/overlap');
    const text = originalSource.slice(s.start, s.end);
    if (sha(text) !== s.sha256 || generatedTs.slice(s.generatedStart, s.generatedEnd) !== text)
      fail('retained segment bytes');
  }
  const generatedIndex = lineIndex(generatedTs),
    originalIndex = lineIndex(originalSource),
    jsIndex = lineIndex(generatedJs);
  const originalImports = originalAst.statements
    .filter(n => ts.isImportDeclaration(n) && !n.importClause?.isTypeOnly)
    .map(n => n.moduleSpecifier.text)
    .sort();
  const ast = await parseAstAsync(generatedJs);
  const scaffold = [];
  const observedImports = [];
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      if (
        node.source.value !== './registry.mjs' ||
        node.specifiers.length !== 1 ||
        node.specifiers[0].local.name !== 'getMock'
      )
        fail('foreign generated import');
      scaffold.push([node.start, node.end]);
    } else if (
      node.type === 'VariableDeclaration' &&
      node.declarations.length === 1 &&
      node.declarations[0].init?.type === 'CallExpression' &&
      node.declarations[0].init.callee.type === 'Identifier' &&
      node.declarations[0].init.callee.name === 'getMock'
    ) {
      const call = node.declarations[0].init;
      if (call.arguments.length !== 1 || typeof call.arguments[0].value !== 'string')
        fail('computed generated binding');
      observedImports.push(call.arguments[0].value);
      scaffold.push([node.start, node.end]);
    }
  }
  if (JSON.stringify(observedImports.sort()) !== JSON.stringify(originalImports))
    fail('original/generated import binding mismatch');
  const composed = new gen.GenMapping({ file: 'wrapper.mjs' });
  gen.setSourceContent(composed, originalPath, originalSource);
  const decoded = trace.decodedMappings(new trace.TraceMap(raw));
  for (let line = 0; line < decoded.length; line++)
    for (const entry of decoded[line]) {
      const mapping = { generated: { line: line + 1, column: entry[0] } };
      if (entry.length > 1) {
        if (entry[1] !== 0) fail('foreign map source');
        const offset = generatedIndex.offset(entry[2] + 1, entry[3]);
        const segment = segments.find(s => offset >= s.generatedStart && offset <= s.generatedEnd);
        if (segment) {
          mapping.source = originalPath;
          mapping.original = originalIndex.position(
            segment.start + offset - segment.generatedStart
          );
        }
      }
      gen.addMapping(composed, mapping);
    }
  const map = gen.toEncodedMap(composed),
    traced = new trace.TraceMap(map);
  const inScaffold = (start, end) => scaffold.some(([a, b]) => start >= a && end <= b);
  const mapped = offset => {
    const at = jsIndex.position(offset);
    const location = trace.originalPositionFor(traced, at);
    return location.source === originalPath && location.line !== null;
  };
  const ignoreNode = node => {
    if (inScaffold(node.start, node.end)) return 'ignore-this-and-nested-nodes';
    if (!mapped(node.start) || !mapped(Math.max(node.start, node.end - 1)))
      fail('unmapped non-scaffold AST node ' + node.type + ' ' + node.start + ':' + node.end);
    return false;
  };
  return { map, ast, ignoreNode, mapped, inScaffold, segments, scaffold, originalIndex };
}
