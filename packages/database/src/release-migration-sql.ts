// Drizzle breakpoints can contain several SQL commands. Check each command boundary, ignoring
// quoted values, identifiers, comments and dollar-quoted function bodies. Transaction commands
// would end the lock or commit the schema without its ledger rows.
export function assertTransactionalMigration(statement: string) {
  const token =
    /\s+|--[^\r\n]*|\/\*|\$[a-z_][a-z_0-9]*\$|\$\$|[eE]'(?:[^'\\]|\\[\s\S]|'')*'|'(?:[^']|'')*'|"(?:[^"]|"")*"|[a-z_][a-z_0-9$]*|[^\s]/iuy;
  const block = /\/\*|\*\//gu;
  const atomic = /\s+atomic\b/iuy;
  let first = true;
  let createsRoutine = false;
  let bodyDepth = 0;
  while (token.lastIndex < statement.length) {
    const match = token.exec(statement);
    if (!match) throw new Error('MIGRATION_SQL_INVALID');
    const [part] = match;
    if (part === '/*') {
      let depth = 1;
      block.lastIndex = token.lastIndex;
      while (depth) {
        const delimiter = block.exec(statement);
        if (!delimiter) throw new Error('MIGRATION_SQL_INVALID');
        depth += delimiter[0] === '/*' ? 1 : -1;
      }
      token.lastIndex = block.lastIndex;
      continue;
    }
    if (/^\s|^--/u.test(part)) continue;
    const word = part.toLowerCase();
    if (part === ';' && bodyDepth === 0) {
      first = true;
      createsRoutine = false;
      continue;
    }
    if (first) createsRoutine = word === 'create';
    // PostgreSQL also supports unquoted SQL routine bodies. CASE/END within the body
    // does not close the BEGIN ATOMIC block.
    if (!first && createsRoutine && word === 'begin') {
      atomic.lastIndex = token.lastIndex;
      if (atomic.test(statement)) {
        bodyDepth++;
        token.lastIndex = atomic.lastIndex;
        continue;
      }
    }
    if (bodyDepth > 0 && word === 'case') bodyDepth++;
    if (bodyDepth > 0 && word === 'end') bodyDepth--;
    if (
      first &&
      /^(?:abort|begin|commit|end|prepare|release|rollback|savepoint|start)$/iu.test(part)
    )
      throw new Error('MIGRATION_TRANSACTION_CONTROL');
    first = false;
    if (part.startsWith('$') && part.length > 1) {
      const end = statement.indexOf(part, token.lastIndex);
      if (end === -1) throw new Error('MIGRATION_SQL_INVALID');
      token.lastIndex = end + part.length;
    } else if (part === "'" || part === '"') {
      throw new Error('MIGRATION_SQL_INVALID');
    }
  }
  if (bodyDepth !== 0) throw new Error('MIGRATION_SQL_INVALID');
}
