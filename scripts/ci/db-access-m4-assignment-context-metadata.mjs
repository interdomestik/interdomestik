// Exact locator data from already accepted fixed assignment ASTs; no evaluator.
import ts from 'typescript';
export function assignmentContextMetadata(source, file, functions) {
  const locate = node => [file, node.pos, node.end, node.kind];
  const imports = new Map();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    for (const element of statement.importClause?.namedBindings?.elements ?? [])
      imports.set(element.name.text, {
        module: statement.moduleSpecifier.text,
        name: (element.propertyName ?? element.name).text,
      });
  }
  return functions.map(({ name, node }) => {
    const calls = [];
    function visit(part) {
      if (
        part !== node &&
        (ts.isFunctionDeclaration(part) ||
          ts.isFunctionExpression(part) ||
          ts.isArrowFunction(part))
      )
        return;
      if (ts.isCallExpression(part) && ts.isIdentifier(part.expression)) {
        const first = node.parameters[0]?.name;
        calls.push({
          locator: locate(part),
          target: imports.get(part.expression.text) ?? { module: null, name: part.expression.text },
          arguments: part.arguments.map(locate),
          receiverForwarded:
            !!first &&
            ts.isIdentifier(first) &&
            !!part.arguments[0] &&
            ts.isIdentifier(part.arguments[0]) &&
            part.arguments[0].text === first.text,
        });
      }
      ts.forEachChild(part, visit);
    }
    visit(node);
    return { name, owner: locate(node), parameters: node.parameters.map(locate), calls };
  });
}
