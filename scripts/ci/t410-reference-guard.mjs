import ts from 'typescript';

// New runtime dependencies require an explicit audit, regardless of command naming.
export const AUDITED_IMPORTS = new Map([
  ['@/actions/notifications', ['getNotifications', 'markAllAsRead', 'markAsRead']],
  ['@interdomestik/ui', ['DropdownMenu', 'DropdownMenuContent']],
  ['next-intl', ['useTranslations']],
  [
    'react',
    [
      'startTransition',
      'useCallback',
      'useEffect',
      'useLayoutEffect',
      'useMemo',
      'useOptimistic',
      'useRef',
      'useState',
    ],
  ],
  [
    './notification-list',
    ['NotificationFeedback', 'NotificationHeader', 'NotificationList', 'NotificationTrigger'],
  ],
]);
const MUTATION =
  /\b(?:(?:activate|cancel|create|issue|pay|record|save|settle|submit|transition|update)\w*(?:Airline|Claim(?:Status)?|Commission|Payout|Recovery|Settlement|Subscription|SuccessFee)|activateSponsoredMembership|bulkApproveCommissions)\w*/u;

export function scan(source, name = 'x.tsx') {
  const nodes = [];
  const collect = node => {
    const erasedType =
      ts.isTypeNode(node) && (!ts.isExpressionWithTypeArguments(node) || ts.isPartOfTypeNode(node));
    if (erasedType || ts.isTypeOnlyImportOrExportDeclaration(node)) return;
    nodes.push(node);
    ts.forEachChild(node, collect);
  };
  const tree = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
  collect(tree);
  const options = { noLib: true, noResolve: true, allowJs: true };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = file => (file === name ? tree : undefined);
  const checker = ts.createProgram([name], options, host).getTypeChecker();
  // Literal aliases are data, resolved only for computed keys or to exclude data reads.
  const literal = (outer, seen = new Set()) => {
    if (!outer) return;
    const node = ts.skipOuterExpressions(outer);
    if (ts.isStringLiteralLike(node)) return node.text;
    if (!ts.isIdentifier(node)) return;
    const symbol = ts.isShorthandPropertyAssignment(node.parent)
      ? checker.getShorthandAssignmentValueSymbol(node.parent)
      : checker.getSymbolAtLocation(node);
    const declaration = symbol?.valueDeclaration;
    if (!declaration || seen.has(declaration) || !ts.isVariableDeclaration(declaration)) return;
    seen.add(declaration);
    return literal(declaration.initializer, seen);
  };
  const key = node => (ts.isComputedPropertyName(node) ? literal(node.expression) : node.text);
  // Capture callable references where introduced; later renaming cannot hide the file.
  const reference = node => {
    if (ts.isElementAccessExpression(node)) return literal(node.argumentExpression);
    if (
      ts.isBindingElement(node) ||
      ts.isImportSpecifier(node) ||
      ts.isExportSpecifier(node) ||
      (ts.isPropertyAssignment(node) && ts.isAssignmentTarget(node.parent))
    )
      return key(node.propertyName ?? node.name);
    if (ts.isPropertyAccessExpression(node)) return node.name.text;
    if (ts.isShorthandPropertyAssignment(node))
      return ts.isAssignmentTarget(node.parent) || literal(node.name) === undefined
        ? node.name.text
        : undefined;
    if (ts.isIdentifier(node) && ts.isInExpressionContext(node) && literal(node) === undefined)
      return node.text;
  };
  const references = nodes.map(reference);
  const unaudited = [];
  const admit = (module, names) => {
    for (const name of names)
      if (!AUDITED_IMPORTS.get(module)?.includes(name)) unaudited.push(`${module}:${name}`);
  };
  for (const node of nodes) {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause?.isTypeOnly) continue;
      const bindings = clause?.namedBindings;
      const names =
        bindings && ts.isNamedImports(bindings)
          ? bindings.elements
              .filter(item => !item.isTypeOnly)
              .map(item => key(item.propertyName ?? item.name))
          : [];
      if (
        !clause ||
        clause.name ||
        (bindings && (ts.isNamespaceImport(bindings) || bindings.elements.length === 0))
      )
        names.push('*');
      admit(node.moduleSpecifier.text, names);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.isTypeOnly) {
      const clause = node.exportClause;
      admit(
        node.moduleSpecifier.text,
        clause && ts.isNamedExports(clause) && clause.elements.length > 0
          ? clause.elements
              .filter(item => !item.isTypeOnly)
              .map(item => key(item.propertyName ?? item.name))
          : ['*']
      );
    } else if (
      (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly) ||
      (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
    )
      unaudited.push('non-static module binding');
  }
  if (references.includes('require')) unaudited.push('CommonJS module binding');
  return {
    forbidden: references.some(name => MUTATION.test(name || '')),
    hook: references.includes('useOptimistic'),
    unaudited,
  };
}
