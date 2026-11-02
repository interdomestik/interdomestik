export type ClaimRow = {
  caseLifecycleState: string;
  id: string;
  recoveryLifecycleState: string;
  tenantId: string;
  updatedAt: Date;
};

export type TokenRow = {
  claimId: string;
  tenantId: string | null;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

type QueryRow = ClaimRow | TokenRow;

export type WhereClause =
  | {
      op: 'and' | 'or';
      args: WhereClause[];
    }
  | {
      op: 'eq' | 'gt';
      left: unknown;
      right: unknown;
    }
  | {
      op: 'isNull';
      value: unknown;
    }
  | null
  | undefined;

export type ColumnMap = Record<string, boolean>;

function resolveField(value: unknown, row: QueryRow): unknown {
  switch (value) {
    case 'claims.id':
    case 'claimTrackingTokens.claimId':
      return 'claimId' in row ? row.claimId : row.id;
    case 'claims.tenantId':
    case 'claimTrackingTokens.tenantId':
      return row.tenantId;
    case 'claims.caseLifecycleState':
      return 'caseLifecycleState' in row ? row.caseLifecycleState : value;
    case 'claims.recoveryLifecycleState':
      return 'recoveryLifecycleState' in row ? row.recoveryLifecycleState : value;
    case 'claims.updatedAt':
      return 'updatedAt' in row ? row.updatedAt : value;
    case 'claimTrackingTokens.tokenHash':
      return 'tokenHash' in row ? row.tokenHash : value;
    case 'claimTrackingTokens.expiresAt':
      return 'expiresAt' in row ? row.expiresAt : value;
    case 'claimTrackingTokens.revokedAt':
      return 'revokedAt' in row ? row.revokedAt : value;
    default:
      return value;
  }
}

export function matches(where: WhereClause, row: QueryRow): boolean {
  if (!where) {
    return true;
  }

  switch (where.op) {
    case 'and':
      return where.args.every(clause => matches(clause, row));
    case 'or':
      return where.args.some(clause => matches(clause, row));
    case 'eq':
      return resolveField(where.left, row) === where.right;
    case 'gt': {
      const left = resolveField(where.left, row);
      const right = where.right;

      if (left instanceof Date && right instanceof Date) {
        return left.getTime() > right.getTime();
      }

      return Number(left) > Number(right);
    }
    case 'isNull':
      return resolveField(where.value, row) == null;
    default:
      return false;
  }
}

function pickColumns<T extends Record<string, unknown>>(row: T, columns?: ColumnMap) {
  if (!columns) {
    return { ...row };
  }

  const entries = Object.entries(columns)
    .filter(([, enabled]) => enabled)
    .map(([key]) => [key, row[key]]);

  return Object.fromEntries(entries);
}

export function findClaim(
  claims: ClaimRow[],
  args: { where?: WhereClause; columns?: ColumnMap }
): Record<string, unknown> | null {
  const claim = claims.find(row => matches(args.where, row));
  return claim ? pickColumns(claim, args.columns) : null;
}

export function findToken(tokens: TokenRow[], args: { where?: WhereClause }) {
  const token = tokens.find(row => matches(args.where, row));
  return token ? { ...token } : null;
}
