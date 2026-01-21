/**
 * Share Pack API E2E Tests
 *
 * Tests share pack creation, access, and error handling.
 * Documents 'doc-ks-1' and 'doc-ks-2' are seeded by ks-workflow-pack.ts.
 */
import { expect, test } from './fixtures/auth.fixture';

// Use hardcoded document IDs from seed (ks-workflow-pack.ts lines 263, 277)
const SEEDED_KS_DOC_IDS = ['doc-ks-1', 'doc-ks-2'];

test.describe('Share Pack API', () => {
  test('should create and access a share pack', async ({ request, adminPage }, testInfo) => {
    // 1. Create Share Pack using project-aware document IDs
    const isMk = testInfo.project.name.includes('mk');
    // Skip MK project - no MK documents seeded
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

    // 3. Test with invalid token - should return 401 or 404 (both are valid security responses)
    const invalidTokenRes = await request.get('/api/share-pack?token=invalid-token-xyz');
    // Accept either 401 (unauthorized) or 404 (not found) - both prevent enumeration
    expect([401, 404]).toContain(invalidTokenRes.status());
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
    // Should return 403 (forbidden) or 404 (not found) since the docs don't belong to tenant
    expect([403, 404]).toContain(res.status());
  });
});
