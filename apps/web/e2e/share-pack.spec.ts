import { db } from '@interdomestik/database/db';
import { documents, sharePacks } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { expect, test } from './fixtures/auth.fixture';

test.describe('Share Pack API', () => {
  let docIds: string[] = [];

  test.beforeAll(async () => {
    // Find some documents for tenant_ks
    const docs = await db.query.documents.findMany({
      where: eq(documents.tenantId, 'tenant_ks'),
      limit: 3,
    });
    if (docs.length === 0) {
      throw new Error('No documents found for tenant_ks in seed data');
    }
    docIds = docs.map(d => d.id);
  });

  test('should create and access a share pack', async ({ request, adminPage }) => {
    // 1. Create Share Pack
    const createRes = await adminPage.request.post('/api/share-pack', {
      data: { documentIds: docIds },
      // Headers handled by auth fixture via Origin/config
    });

    // Log response if failure
    if (createRes.status() !== 200) {
      console.log('Create failed:', createRes.status());
      console.log('Response:', await createRes.text());
    }

    expect(createRes.status()).toBe(200);
    const { token, packId } = await createRes.json();
    expect(token).toBeTruthy();
    expect(packId).toBeTruthy();

    // 2. Access Share Pack (Public Access)
    const accessRes = await request.get(`/api/share-pack?token=${token}`);
    expect(accessRes.status()).toBe(200);
    const accessData = await accessRes.json();
    expect(accessData.documents).toHaveLength(docIds.length);
    expect(accessData.packId).toBe(packId);

    // 3. Test Revocation (Manually revoke in DB)
    await db
      .update(sharePacks)
      .set({ revokedAt: new Date(), revokedByUserId: 'admin-ks' })
      .where(eq(sharePacks.id, packId));

    // 4. Access Revoked Pack
    const revokedRes = await request.get(`/api/share-pack?token=${token}`);
    expect(revokedRes.status()).toBe(404);
  });

  test('should fail with invalid documentIds', async ({ adminPage }) => {
    const res = await adminPage.request.post('/api/share-pack', {
      data: { documentIds: [] },
    });
    if (res.status() !== 400) {
      console.log('Invalid docIds failed:', res.status(), await res.text());
    }
    expect(res.status()).toBe(400);
  });
});
