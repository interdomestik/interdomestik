/**
 * Share Pack API E2E Tests
 *
 * @quarantine - Requires seeded documents (doc-ks-1, doc-ks-2) not in standard e2e seed
 * @ticket INTERDO-Q002: Re-enable after seed:e2e includes share-pack documents
 * @expiry 2026-02-15
 */
import { expect, test } from './fixtures/auth.fixture';

// NOTE: This test requires 'doc-ks-1' and 'doc-ks-2' to exist in the database.
// These are seeded by ks-workflow-pack.ts but may not be in the standard seed:e2e.

// Use hardcoded document IDs from seed (ks-workflow-pack.ts lines 263, 277)
const SEEDED_KS_DOC_IDS = ['doc-ks-1', 'doc-ks-2'];

test.describe('Share Pack API @quarantine', () => {
  test('should create and access a share pack', async ({ request, adminPage }, testInfo) => {
    // 1. Create Share Pack using project-aware document IDs
    const isMk = testInfo.project.name.includes('mk');
    // TODO: Seed 'doc-mk-1' in database/src/seed-packs/mk-workflow-pack.ts
    test.skip(isMk, 'MK seed missing doc-mk-1');

    // Use seeded documents: 'doc-ks-1' for KS
    const docIds = SEEDED_KS_DOC_IDS;

    const createRes = await adminPage.request.post('/api/share-pack', {
      data: { documentIds: docIds },
    });

    // Debug logging on failure
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
    expect(accessData.documents).toHaveLength(SEEDED_KS_DOC_IDS.length);
    expect(accessData.packId).toBe(packId);

    // 3. Test with invalid token
    const invalidTokenRes = await request.get('/api/share-pack?token=invalid-token-xyz');
    expect(invalidTokenRes.status()).toBe(401);
  });

  test('should fail with invalid documentIds', async ({ adminPage }) => {
    const res = await adminPage.request.post('/api/share-pack', {
      data: { documentIds: [] },
    });
    expect(res.status()).toBe(400);
  });

  test('should fail with non-existent documentIds', async ({ adminPage }) => {
    const res = await adminPage.request.post('/api/share-pack', {
      data: { documentIds: ['non-existent-doc-id-1', 'non-existent-doc-id-2'] },
    });
    // Should return 403 (forbidden) since the docs don't belong to tenant
    expect(res.status()).toBe(403);
  });
});
