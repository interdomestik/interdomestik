type CommandState = { first: boolean; createsRoutine: boolean; bodyDepth: number };

function blockCommentEnd(statement: string, start: number) {
  const block = /\/\*|\*\//gu;
  block.lastIndex = start;
  let depth = 1;
  while (depth) {
    const delimiter = block.exec(statement);
    if (!delimiter) throw new Error('MIGRATION_SQL_INVALID');
    depth += delimiter[0] === '/*' ? 1 : -1;
  }
  return block.lastIndex;
}

function assertAllowedCommand(part: string, statement: string, start: number) {
  if (/^(?:abort|begin|commit|end|prepare|release|rollback|savepoint|start)$/iu.test(part))
    throw new Error('MIGRATION_TRANSACTION_CONTROL');
  if (
    /^(?:set|reset|discard)$/iu.test(part) &&
    !/^(?:set\s+statement_timeout\s*=\s*'\d+s'|reset\s+statement_timeout)\s*;/iu.test(
      statement.slice(start)
    )
  )
    throw new Error('MIGRATION_SESSION_CONTROL');
}

function skipQuotedValue(statement: string, part: string, token: RegExp) {
  if (part.startsWith('$') && part.length > 1) {
    const end = statement.indexOf(part, token.lastIndex);
    if (end === -1) throw new Error('MIGRATION_SQL_INVALID');
    token.lastIndex = end + part.length;
  } else if (part === "'" || part === '"') {
    throw new Error('MIGRATION_SQL_INVALID');
  }
}

function advanceCommand(
  statement: string,
  match: RegExpExecArray,
  token: RegExp,
  state: CommandState
) {
  const [part] = match;
  const word = part.toLowerCase();
  if (part === ';' && state.bodyDepth === 0) {
    state.first = true;
    state.createsRoutine = false;
    return;
  }
  if (state.first) state.createsRoutine = word === 'create';
  // PostgreSQL also supports unquoted SQL routine bodies. CASE/END within the body
  // does not close the BEGIN ATOMIC block.
  if (!state.first && state.createsRoutine && word === 'begin') {
    const atomic = /\s+atomic\b/iuy;
    atomic.lastIndex = token.lastIndex;
    if (atomic.test(statement)) {
      state.bodyDepth++;
      token.lastIndex = atomic.lastIndex;
      return;
    }
  }
  if (state.bodyDepth > 0 && word === 'case') state.bodyDepth++;
  if (state.bodyDepth > 0 && word === 'end') state.bodyDepth--;
  if (state.first) assertAllowedCommand(part, statement, match.index);
  state.first = false;
  skipQuotedValue(statement, part, token);
}

// Drizzle breakpoints can contain several SQL commands. Check each command boundary, ignoring
// quoted values, identifiers, comments and dollar-quoted function bodies. Transaction commands
// would end the lock or commit the schema without its ledger rows.
export function assertTransactionalMigration(statement: string) {
  const token =
    /\s+|--[^\r\n]*|\/\*|\$[a-z_][a-z_0-9]*\$|\$\$|[eE]'(?:[^'\\]|\\[\s\S]|'')*'|'(?:[^']|'')*'|"(?:[^"]|"")*"|[a-z_][a-z_0-9$]*|[^\s]/iuy;
  const state: CommandState = { first: true, createsRoutine: false, bodyDepth: 0 };
  while (token.lastIndex < statement.length) {
    const match = token.exec(statement);
    if (!match) throw new Error('MIGRATION_SQL_INVALID');
    const [part] = match;
    if (part === '/*') {
      token.lastIndex = blockCommentEnd(statement, token.lastIndex);
      continue;
    }
    if (/^\s|^--/u.test(part)) continue;
    advanceCommand(statement, match, token, state);
  }
  if (state.bodyDepth !== 0) throw new Error('MIGRATION_SQL_INVALID');
}
