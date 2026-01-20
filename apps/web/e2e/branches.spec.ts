import { test } from './fixtures/auth.fixture';
import { BranchesScreen } from './screens/branches.screen';

test.describe('Branch Management', () => {
  // V2 UI uses Card-based layout with stable test-ids.
  test('Admin can CRUD branches', async ({ adminPage: page }, testInfo) => {
    const branchName = `Test Branch ${testInfo.project.name} CRUD`;
    const branchCode = `TB-${testInfo.project.name}-CRUD`;
    const branches = new BranchesScreen(page);

    // 1. Navigate to Branches page
    await branches.goto();
    await branches.assertLoaded();

    // Idempotency: cleanup ALL existing branches with this code
    // Loop ensures we clean up duplicates from failed prior runs
    await branches.cleanupByCode(branchCode);

    // 2. Create Branch
    await branches.createBranch({ name: branchName, code: branchCode });
    await branches.assertBranchVisible(branchName);
    await branches.assertBranchVisible(branchCode);

    // 3. Edit Branch
    const updatedName = `${branchName} Updated`;
    await branches.editBranchName(branchName, updatedName);

    // 4. Delete Branch
    await branches.deleteBranch(updatedName);
  });
});
