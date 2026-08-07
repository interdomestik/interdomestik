import { dbAdmin } from '@interdomestik/database/db';
import { user, verification } from '@interdomestik/database/schema';
import { and, eq, ne, sql } from 'drizzle-orm';

type Stage = 'current' | 'replacement';
type Tx = Parameters<Parameters<typeof dbAdmin.transaction>[0]>[0];
// prettier-ignore
type Challenge = { active: boolean; attempts: number; digest: string; nonce: string; newEmail?: string; oldEmail?: string };
type StoreResult = { ok: boolean };
// prettier-ignore
type CurrentReservation = { currentEmail: string; digest: string; nonce: string; now: Date; userId: string };
// prettier-ignore
type ReplacementReservation = { currentDigest: string; newEmail: string; nonce: string; now: Date; replacementDigest: string; userId: string };
const identifier = (userId: string, stage: Stage) => `ida-ui03b:${userId}:${stage}`;
const canonical = (email: string) => email.trim().toLowerCase();
const expiry = (now: Date) => new Date(now.getTime() + 300_000);

// prettier-ignore
async function withUserLock<T>(userId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  // db-access-guard: system-exempt -- reason: session-selected auth recovery serializes one user before tenant-scoped draft access exists
  return dbAdmin.transaction(async tx => { await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 9303))`); return work(tx); });
}
// prettier-ignore
async function owner(tx: Tx, userId: string) {
  // db-access-guard: system-exempt -- reason: authoritative session user is re-read for same-row email compare-and-swap
  const [row] = await tx.select({ email: user.email, id: user.id }).from(user).where(eq(user.id, userId)).limit(1); return row;
}
// prettier-ignore
async function challenge(tx: Tx, userId: string, stage: Stage) {
  // db-access-guard: system-exempt -- reason: auth proof identifier derives only from authoritative session user and fixed stage
  const [row] = await tx.select().from(verification).where(eq(verification.identifier, identifier(userId, stage))).limit(1);
  if (!row) return null;
  try { return { ...row, data: JSON.parse(row.value) as Challenge }; }
  // db-access-guard: system-exempt -- reason: malformed auth proof cleanup deletes only the exact selected verification row
  catch { await tx.delete(verification).where(eq(verification.id, row.id)); return null; }
}
async function clearStage(tx: Tx, userId: string, stage: Stage) {
  // db-access-guard: system-exempt -- reason: stage rotation clears only the session-user fixed recovery identifier
  await tx.delete(verification).where(eq(verification.identifier, identifier(userId, stage)));
}
// prettier-ignore
async function insertChallenge(tx: Tx, userId: string, stage: Stage, nonce: string, digest: string, now: Date, extra: Pick<Challenge, 'newEmail' | 'oldEmail'> = {}) {
  // db-access-guard: system-exempt -- reason: auth proof reservation is bound to session user, fixed stage and random nonce
  await tx.insert(verification).values({
    id: nonce, identifier: identifier(userId, stage), expiresAt: expiry(now), createdAt: now, updatedAt: now,
    value: JSON.stringify({ active: false, attempts: 0, digest, nonce, ...extra }),
  });
}
// prettier-ignore
async function verify(tx: Tx, row: NonNullable<Awaited<ReturnType<typeof challenge>>>, digest: string, now: Date) {
  // db-access-guard: system-exempt -- reason: expiry removes only the exact selected auth proof row
  if (!row.data.active || row.expiresAt <= now) { await tx.delete(verification).where(eq(verification.id, row.id)); return false; }
  if (row.data.digest === digest) return true;
  const attempts = row.data.attempts + 1;
  // db-access-guard: system-exempt -- reason: attempt exhaustion removes only the exact selected auth proof row
  if (attempts >= 3) await tx.delete(verification).where(eq(verification.id, row.id));
  // db-access-guard: system-exempt -- reason: failed attempt increments only the exact selected auth proof row
  else await tx.update(verification).set({ value: JSON.stringify({ ...row.data, attempts }), updatedAt: now }).where(eq(verification.id, row.id));
  return false;
}
// prettier-ignore
async function collision(tx: Tx, userId: string, email: string) {
  // db-access-guard: system-exempt -- reason: fail-closed auth recovery requires global canonical email collision containment
  const [row] = await tx.select({ id: user.id }).from(user).where(and(ne(user.id, userId), sql`lower(btrim(${user.email})) = ${canonical(email)}`)).limit(1); return Boolean(row);
}

// prettier-ignore
export async function reserveCurrentProof(args: CurrentReservation): Promise<StoreResult> {
  return withUserLock(args.userId, async tx => {
    const current = await owner(tx, args.userId); if (!current || canonical(current.email) !== canonical(args.currentEmail)) return { ok: false };
    await clearStage(tx, args.userId, 'current'); await clearStage(tx, args.userId, 'replacement');
    await insertChallenge(tx, args.userId, 'current', args.nonce, args.digest, args.now); return { ok: true };
  });
}
// prettier-ignore
export async function activateCurrentProof(userId: string, nonce: string, expectedEmail: string, now: Date) {
  return withUserLock(userId, async tx => {
    const row = await challenge(tx, userId, 'current'); if (!row || row.id !== nonce || row.data.active || row.expiresAt <= now) return false;
    const current = await owner(tx, userId);
    // db-access-guard: system-exempt -- reason: activation drift removes only the exact random recovery nonce
    if (!current || canonical(current.email) !== canonical(expectedEmail)) { await tx.delete(verification).where(eq(verification.id, nonce)); return false; }
    // db-access-guard: system-exempt -- reason: activation compares exact nonce and prior serialized disabled proof
    const [activated] = await tx.update(verification).set({ value: JSON.stringify({ ...row.data, active: true }), updatedAt: now }).where(and(eq(verification.id, nonce), eq(verification.value, row.value))).returning({ id: verification.id });
    return Boolean(activated);
  });
}
// prettier-ignore
export async function reserveReplacementProof(args: ReplacementReservation): Promise<StoreResult> {
  return withUserLock(args.userId, async tx => {
    const proof = await challenge(tx, args.userId, 'current'); if (!proof || !(await verify(tx, proof, args.currentDigest, args.now))) return { ok: false };
    const current = await owner(tx, args.userId); await clearStage(tx, args.userId, 'current'); await clearStage(tx, args.userId, 'replacement');
    if (!current || canonical(current.email) === canonical(args.newEmail) || await collision(tx, args.userId, args.newEmail)) return { ok: false };
    await insertChallenge(tx, args.userId, 'replacement', args.nonce, args.replacementDigest, args.now, { newEmail: canonical(args.newEmail), oldEmail: current.email });
    return { ok: true };
  });
}
// prettier-ignore
export async function activateReplacementProof(userId: string, nonce: string, now: Date) {
  return withUserLock(userId, async tx => {
    const row = await challenge(tx, userId, 'replacement'); if (!row || row.id !== nonce || row.data.active || row.expiresAt <= now) return false;
    // db-access-guard: system-exempt -- reason: replacement activation compares exact nonce and prior serialized disabled proof
    const [activated] = await tx.update(verification).set({ value: JSON.stringify({ ...row.data, active: true }), updatedAt: now }).where(and(eq(verification.id, nonce), eq(verification.value, row.value))).returning({ id: verification.id });
    return Boolean(activated);
  });
}
export async function discardProof(userId: string, _stage: Stage, nonce: string) {
  // db-access-guard: system-exempt -- reason: delivery failure cleanup deletes only the exact task-owned recovery nonce
  await withUserLock(userId, tx => tx.delete(verification).where(eq(verification.id, nonce)));
}
// prettier-ignore
export async function confirmReplacementProof(userId: string, digest: (email: string) => string, now: Date): Promise<StoreResult> {
  try {
    return await withUserLock(userId, async tx => {
      const proof = await challenge(tx, userId, 'replacement'), newEmail = proof?.data.newEmail;
      if (!proof || !newEmail || !(await verify(tx, proof, digest(newEmail), now))) return { ok: false };
      // db-access-guard: system-exempt -- reason: short auth-table lock serializes global collision check with concurrent identity writers
      await tx.execute(sql`lock table "user" in share row exclusive mode`);
      const current = await owner(tx, userId), oldEmail = proof.data.oldEmail;
      if (!current || !oldEmail || current.email !== oldEmail || await collision(tx, userId, newEmail)) { await clearStage(tx, userId, 'replacement'); return { ok: false }; }
      // db-access-guard: system-exempt -- reason: dual-proof completion updates only session user by exact old-email compare-and-swap
      const [updated] = await tx.update(user).set({ email: newEmail, emailVerified: true }).where(and(eq(user.id, userId), eq(user.email, oldEmail))).returning({ id: user.id });
      await clearStage(tx, userId, 'replacement'); return { ok: updated?.id === userId };
    });
  } catch { return { ok: false }; }
}
