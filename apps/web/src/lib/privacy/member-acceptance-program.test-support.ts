import path from 'node:path';
import ts from 'typescript';
import { resolveModule } from '../../../../../scripts/ci/server-mutation/ast.mjs';
import { hasSymbolFlag } from './member-acceptance-ast.test-support';

function localSpecifier(specifier: string) {
  return (
    specifier.startsWith('.') ||
    specifier.startsWith('@/') ||
    specifier.startsWith('@interdomestik/')
  );
}

function compilerOptions(directory: string): ts.CompilerOptions {
  const config = path.join(directory, 'apps/web/tsconfig.json');
  if (ts.sys.fileExists(config)) {
    const read = ts.readConfigFile(config, ts.sys.readFile);
    if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, ' '));
    const result = ts.convertCompilerOptionsFromJson(
      read.config.compilerOptions,
      path.dirname(config)
    );
    if (result.errors.length) {
      throw new Error(ts.flattenDiagnosticMessageText(result.errors[0].messageText, ' '));
    }
    return result.options;
  }
  return {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: true,
    noLib: true,
    types: [],
    paths: { '@/*': [path.join(directory, 'apps/web/src/*')] },
  };
}

export function importBinding(symbol: ts.Symbol | undefined) {
  const declaration = symbol?.declarations?.[0];
  if (!declaration) return undefined;
  if (ts.isImportSpecifier(declaration)) {
    const clause = declaration.parent.parent;
    if (clause.isTypeOnly || declaration.isTypeOnly) return undefined;
    return {
      node: declaration,
      specifier: clause.parent.moduleSpecifier,
      imported: (declaration.propertyName ?? declaration.name).text,
    };
  }
  if (ts.isNamespaceImport(declaration) && !declaration.parent.isTypeOnly) {
    return {
      node: declaration,
      specifier: declaration.parent.parent.moduleSpecifier,
      imported: '*',
    };
  }
  if (ts.isImportClause(declaration) && !declaration.isTypeOnly) {
    return {
      node: declaration,
      specifier: declaration.parent.moduleSpecifier,
      imported: 'default',
    };
  }
}

export function createSourceProgram(directory: string, files: string[]) {
  const options = compilerOptions(directory);
  const host = ts.createCompilerHost(options, true);
  const cache = ts.createModuleResolutionCache(directory, host.getCanonicalFileName, options);

  function resolveModuleAt(from: string, specifier: string) {
    const file =
      localSpecifier(specifier) &&
      resolveModule(directory, path.relative(directory, from), specifier);
    if (typeof file === 'string') {
      return {
        resolvedModule: {
          resolvedFileName: path.join(directory, file),
          extension: path.extname(file),
        },
      };
    }
    return ts.resolveModuleName(specifier, from, options, host, cache);
  }
  host.resolveModuleNameLiterals = (literals, from) =>
    literals.map(literal => resolveModuleAt(from, literal.text));

  const program = ts.createProgram(
    files.map(file => path.join(directory, file)),
    options,
    host
  );
  const checker = program.getTypeChecker();
  const checkedSyntax = new Set<ts.SourceFile>();
  function getSource(file: string) {
    const source = program.getSourceFile(path.join(directory, file));
    if (!source || checkedSyntax.has(source)) return source;
    const diagnostic = program.getSyntacticDiagnostics(source)[0];
    if (diagnostic) {
      throw new Error(
        `Syntax error in ${file}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`
      );
    }
    checkedSyntax.add(source);
    return source;
  }
  const fileOf = (node: ts.Node) => path.relative(directory, node.getSourceFile().fileName);

  function parse(file: string) {
    const source = getSource(file);
    if (!source) throw new Error(`Unresolved source: ${file}`);
    return source;
  }

  function resolvePath(file: string, specifier: string) {
    if (!localSpecifier(specifier) || /\.css$|\?raw$/u.test(specifier)) return null;
    const resolved = resolveModuleAt(path.join(directory, file), specifier).resolvedModule;
    if (!resolved) throw new Error(`Unresolved import or re-export: ${file} -> ${specifier}`);
    return path.relative(directory, resolved.resolvedFileName);
  }

  function symbolAt(node: ts.Node) {
    if (node.parent && ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) {
      return checker.getShorthandAssignmentValueSymbol(node.parent);
    }
    return checker.getSymbolAtLocation(node);
  }

  function unalias(symbol: ts.Symbol | undefined) {
    return symbol && hasSymbolFlag(symbol, ts.SymbolFlags.Alias)
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  }

  function refOf(symbol: ts.Symbol | undefined) {
    const actual = unalias(symbol);
    const decl = actual?.valueDeclaration ?? actual?.declarations?.[0];
    if (!decl || decl.getSourceFile().isDeclarationFile) return undefined;
    const file = fileOf(decl);
    if (file.startsWith('../') || file.split('/').includes('node_modules')) return undefined;
    return { file, decl };
  }

  function moduleExports(symbol: ts.Symbol | undefined) {
    const actual = unalias(symbol);
    return actual && hasSymbolFlag(actual, ts.SymbolFlags.Module)
      ? checker.getExportsOfModule(actual)
      : [];
  }

  function exportsOf(file: string) {
    return moduleExports(symbolAt(parse(file)));
  }

  function exportRef(file: string, name: string) {
    return refOf(exportsOf(file).find(symbol => symbol.name === name));
  }

  return {
    parse,
    getSource,
    resolvePath,
    symbolAt,
    unalias,
    refOf,
    moduleExports,
    exportsOf,
    exportRef,
    fileOf,
    localExportBinding: (node: ts.ExportSpecifier) =>
      checker.getExportSpecifierLocalTargetSymbol(node),
  };
}

export type SourceProgram = ReturnType<typeof createSourceProgram>;
