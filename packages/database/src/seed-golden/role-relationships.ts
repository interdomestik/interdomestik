import { E2E_MESSAGE_FIXTURES } from '../e2e-role-fixtures';
import type { SeedGoldenContext } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

type ClaimMessageInsert = SeedGoldenContext['schema']['claimMessages']['$inferInsert'];

/**
 * Public + internal message pair on the KS anchor case (internal-visibility denial fixture).
 * The anchor case is created at at(-35d); both messages follow it deterministically.
 */
export function buildRoleRelationshipMessages({
  at,
}: Pick<SeedGoldenContext, 'at'>): ClaimMessageInsert[] {
  const { KS_ANCHOR_PUBLIC: publicMessage, KS_ANCHOR_INTERNAL: internalMessage } =
    E2E_MESSAGE_FIXTURES;

  return [
    { ...publicMessage, readAt: null, createdAt: at(-34 * DAY_MS) },
    { ...internalMessage, readAt: null, createdAt: at(-34 * DAY_MS + HOUR_MS) },
  ];
}

export async function seedRoleRelationshipMessages(context: SeedGoldenContext): Promise<void> {
  const { at, db, schema } = context;

  for (const message of buildRoleRelationshipMessages({ at })) {
    await db
      .insert(schema.claimMessages)
      .values(message)
      .onConflictDoUpdate({
        target: schema.claimMessages.id,
        set: {
          content: message.content,
          isInternal: message.isInternal,
          senderId: message.senderId,
          createdAt: message.createdAt,
        },
      });
  }
}
