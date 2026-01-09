import * as dotenv from 'dotenv';
import { eq } from 'drizzle-orm';
import { resolve } from 'node:path';
import { db } from './db';
import { branches, claims, user } from './schema';

dotenv.config({ path: resolve(__dirname, '../../../.env') });

async function verify() {
  console.log('Verifying Golden Data...');

  const member = await db.query.user.findFirst({
    where: eq(user.email, 'member.mk.1@interdomestik.com'),
  });
  console.log('Member:', member ? 'FOUND' : 'MISSING');

  const claim = await db.query.claims.findFirst({
    where: eq(claims.title, 'Rear ended in Skopje'),
  });
  console.log('Claim:', claim ? 'FOUND' : 'MISSING');

  const branch = await db.query.branches.findFirst({
    where: eq(branches.name, 'MK Branch A (Main)'),
  });
  console.log('Branch:', branch ? 'FOUND' : 'MISSING');

  process.exit(0);
}

verify().catch(console.error);
