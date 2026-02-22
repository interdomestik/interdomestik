import { branches, db, eq } from '@interdomestik/database';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('C1 Pilot: Branch + Agent Assignment', () => {
  // Use unique names to avoid conflicts if test reruns without full reset
  const branchName = `Pilot Branch ${Math.random().toString(36).slice(2, 7)}`;
  const branchCode = `P-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

  test('Admin creates branch, assigns agent, and agent verifies context', async ({
    adminPage,
    browser,
    baseURL,
  }, testInfo) => {
    // --- PART 1: ADMIN ACTIONS ---
    console.log(`[Test] Creating branch: ${branchName} (${branchCode})`);

    // 1. Create Branch
    await gotoApp(adminPage, routes.adminBranches(testInfo), testInfo, {
      marker: 'branches-screen',
    });

    await adminPage.getByTestId('create-branch-button').click();
    await adminPage.getByTestId('branch-name-input').fill(branchName);
    await adminPage.getByTestId('branch-code-input').fill(branchCode);
    await adminPage.getByTestId('branch-submit-button').click();

    // Verify branch created
    await expect(adminPage.getByTestId(`branch-card-${branchCode}`)).toBeVisible({
      timeout: 10000,
    });
    await expect(adminPage.getByTestId(`branch-card-${branchCode}`)).toContainText(branchName);
    console.log(`[Test] Branch ${branchCode} created successfully.`);

    // 2. Assign Agent to Branch
    const agentId = 'golden_pilot_mk_agent_2';
    console.log(`[Test] Assigning agent ${agentId} to branch ${branchName}`);
    await gotoApp(adminPage, `/en/admin/users/${agentId}`, testInfo, { marker: 'body' });

    // Wait for data to load
    await adminPage.waitForSelector('text=Roles');
    await adminPage.waitForLoadState('networkidle');

    // --- DETERMINISTIC RADIX INTERACTION PATTERN ---

    // 1. Role Selection
    // Click exact trigger
    await adminPage.getByTestId('role-select-trigger').click();

    // Wait for portal content to be visible.
    await expect(adminPage.getByTestId('role-select-content')).toBeVisible();

    // Click option by testid
    await adminPage.getByTestId('role-option-agent').click();
    console.log(`[Test] Selected 'agent' role.`);

    // 2. Branch Selection
    // Click exact trigger
    await adminPage.getByTestId('branch-select-trigger').click();

    // Wait for portal content
    await expect(adminPage.getByTestId('branch-select-content')).toBeVisible();

    const createdBranch = await db.query.branches.findFirst({
      where: eq(branches.code, branchCode),
      columns: { id: true },
    });
    if (!createdBranch?.id) {
      throw new Error(`Expected created branch with code ${branchCode}`);
    }

    const branchOption = adminPage.getByTestId(`branch-option-${createdBranch.id}`);
    await branchOption.scrollIntoViewIfNeeded();
    await branchOption.click({ force: true });
    console.log(`[Test] Selected branch: ${branchName}`);

    await adminPage.getByRole('button', { name: /Grant role/i }).click();

    // Verify assignment in the table using the specific testid
    const rolesTable = adminPage.getByTestId('user-roles-table');
    await expect(rolesTable).toContainText('agent', { timeout: 10000 });
    await expect(rolesTable).toContainText(branchName);
    console.log(`[Test] Agent assigned to branch successfully.`);

    // --- PART 2: AGENT VERIFICATION ---
    console.log(`[Test] Verifying agent login and context...`);

    // Create a fresh context for the agent
    const agentContext = await browser.newContext({
      baseURL: baseURL,
      extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
    });
    const agentPage = await agentContext.newPage();

    await agentPage.goto('/en/login');
    await agentPage.fill('input[name="email"]', 'agent.pilot.2@interdomestik.com');
    await agentPage.fill('input[name="password"]', 'GoldenPass123!');
    await agentPage.getByTestId('login-submit').click();

    // Explicitly navigate to dashboard root, bypassing canonical redirect to /members
    await agentPage.waitForURL(/\/en\/agent/); // Wait for login redirect first
    await agentPage.goto('/en/agent');

    // Wait for navigation to agent dashboard
    await expect(agentPage).toHaveURL(/\/en\/agent$/); // Exact match
    console.log(`[Test] Agent logged in successfully. URL: ${agentPage.url()}`);

    // Verify they see the branch name in their context (using the data-testid I added)
    const branchContext = agentPage.getByTestId('agent-branch-context');
    await expect(branchContext).toBeVisible({ timeout: 10000 });
    await expect(branchContext).toHaveText(branchName);

    console.log(`[Test] Agent verified in correct branch context: ${branchName}`);

    await agentContext.close();
  });
});
