import { expect, test } from '../fixtures/auth.fixture';
import { credsFor } from '../fixtures/auth-users';
import { getProjectUrlInfo, ipForRole } from '../fixtures/auth.project';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { withAgentMessageFixture } from './agent-message-visibility.fixture';

// Real synthetic session; this gate uses the same public/internal adversarial rows as S8.
test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });

test('mobile agent case selection, focus, refresh and public-only conversation', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await withAgentMessageFixture(info.project.name, async fixture => {
    const { origin } = getProjectUrlInfo(info, null);
    const credentials = credsFor('agent', info.project.name.includes('mk') ? 'mk' : 'ks');
    const signedIn = await page.request.post(`${origin}/api/auth/sign-in/email`, {
      data: { email: fixture.email, password: credentials.password },
      headers: {
        Origin: origin,
        'x-forwarded-for': ipForRole('agent'),
        ...info.project.use.extraHTTPHeaders,
      },
    });
    expect(signedIn.ok()).toBe(true);
    expect((await signedIn.json()).user.id).toBe(fixture.agentId);
    await gotoApp(page, routes.agentWorkspaceClaims(info), info, {
      marker: 'agent-claims-pro-page',
    });
    await page.getByTestId('cookie-consent-decline').click();
    const workspace = page.locator('[data-testid="agent-claims-pro-page"]:visible');
    const claimId = fixture.claimIds[0];
    const opener = workspace.getByTestId('claim-row').filter({ hasText: claimId });
    const stack = workspace.getByTestId('ops-drawer');
    await expect(opener).toHaveCount(1);
    await expect(opener).toHaveJSProperty('tagName', 'BUTTON');
    await expect(opener).toContainText('S1 public agent reply');
    await expect(opener.getByTestId(`unread-badge-${claimId}`)).toHaveText('1');
    await opener.click();
    await expect(page).toHaveURL(url => url.searchParams.get('selected') === claimId);
    await expect(stack).toHaveJSProperty('tagName', 'SECTION');
    await expect(stack).toBeFocused();
    await expect(stack.getByTestId('workspace-selected-claim-id')).toHaveAttribute(
      'data-claim-id',
      claimId
    );

    // Workspace cards retain main's selected alias; either dismissal clears selection.
    await page.keyboard.press('Escape');
    await expect(stack).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(page).toHaveURL(
      url => !url.searchParams.has('claimId') && !url.searchParams.has('selected')
    );
    await opener.click();
    await expect(stack).toBeFocused();
    const nextClaimId = fixture.claimIds[1];
    const nextOpener = workspace.getByTestId('claim-row').filter({
      has: page.getByText(nextClaimId, { exact: true }),
    });
    await nextOpener.click();
    await expect(stack.getByTestId('workspace-selected-claim-id')).toHaveAttribute(
      'data-claim-id',
      nextClaimId
    );
    await expect(stack).toBeFocused();
    await stack.getByTestId('ops-drawer-close').click();
    await expect(stack).toHaveCount(0);
    await expect(nextOpener).toBeFocused();
    await expect(opener).not.toBeFocused();
    await expect(page).toHaveURL(
      url => !url.searchParams.has('claimId') && !url.searchParams.has('selected')
    );

    // Direct case links use claimId. Shell dismissal and refresh leave that URL intact.
    await gotoApp(
      page,
      `${routes.agentWorkspaceClaims(info)}?claimId=${encodeURIComponent(claimId)}`,
      info,
      { marker: 'agent-claims-pro-page' }
    );
    await expect(stack.getByTestId('workspace-selected-claim-id')).toHaveAttribute(
      'data-claim-id',
      claimId
    );
    const selectedUrl = page.url();
    const more = page.getByTestId('role-shell-bottom-nav').getByRole('button');
    await more.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(more).toBeFocused();
    await expect(page).toHaveURL(selectedUrl);
    await expect(stack.getByTestId('workspace-selected-claim-id')).toHaveAttribute(
      'data-claim-id',
      claimId
    );
    await page.reload();
    await expect(page).toHaveURL(selectedUrl);
    await expect(stack.getByTestId('workspace-selected-claim-id')).toHaveAttribute(
      'data-claim-id',
      claimId
    );

    const assertNoPrivateContent = async () => {
      const html = await page.content();
      for (const secret of [
        'S1 old internal',
        'S1 newest internal secret',
        'S1 internal only secret',
        'S1 foreign message secret',
        'S1 unspecified visibility',
      ]) {
        expect(html).not.toContain(secret);
      }
    };
    const assertReflow = async () => {
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
    };
    for (const width of [390, 320, 360, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await assertReflow();
      const nav = page.getByTestId('role-shell-bottom-nav');
      for (const target of await nav.locator('a, button').all()) {
        const box = await target.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
    }
    await assertNoPrivateContent();
    await stack.getByTestId('action-message').click();
    const panel = stack.getByTestId('messaging-panel');
    await expect(panel).toContainText('S1 public incoming');
    await expect(panel.getByTestId('internal-note-toggle')).toHaveCount(0);
    await expect(panel.getByTestId('messaging-public-audience')).toBeVisible();
    await page.setViewportSize({ width: 320, height: 844 });
    await assertReflow();
    await assertNoPrivateContent();
    await stack.getByTestId('close-messaging-view').click();
    await expect(page).toHaveURL(url => url.searchParams.get('claimId') === claimId);
    await assertNoPrivateContent();

    // Re-selecting the current workspace from More keeps A and its URL-owned panel.
    await page.setViewportSize({ width: 390, height: 844 });
    await more.click();
    const moreSheet = page.getByRole('dialog');
    const claimsLink = moreSheet.locator('a[href*="/agent/workspace/claims"]');
    const samePageHref = await claimsLink.getAttribute('href');
    expect(new URL(samePageHref!, page.url()).href).toBe(selectedUrl);
    await claimsLink.click();
    await expect(moreSheet).toHaveCount(0);
    await expect(page).toHaveURL(selectedUrl);
    await expect(stack.getByTestId('workspace-selected-claim-id')).toHaveAttribute(
      'data-claim-id',
      claimId
    );

    // A different section receives no case query; returning via More opens the unselected list.
    await more.click();
    await moreSheet.locator('a[href$="/agent/workspace"]').click();
    await expect(page).toHaveURL(
      url => url.pathname.endsWith('/agent/workspace') && url.search === ''
    );
    await expect(moreSheet).toHaveCount(0);
    await more.click();
    await expect(claimsLink).toHaveAttribute('href', /\/agent\/workspace\/claims$/);
    await claimsLink.click();
    await expect(moreSheet).toHaveCount(0);
    await expect(page).toHaveURL(
      url => url.pathname.endsWith('/agent/workspace/claims') && url.search === ''
    );
    await expect(opener).toBeVisible();
    await expect(stack).toHaveCount(0);

    // Extra history coverage: back through the landing page restores the selected URL.
    await page.goBack();
    await expect(page).toHaveURL(url => url.pathname.endsWith('/agent/workspace'));
    await page.goBack();
    await expect(page).toHaveURL(selectedUrl);
    await expect(stack.getByTestId('workspace-selected-claim-id')).toHaveAttribute(
      'data-claim-id',
      claimId
    );
    await assertReflow();
    await stack.getByTestId('ops-drawer-close').click();
    await expect(stack).toHaveCount(0);
    await expect(page).toHaveURL(
      url => !url.searchParams.has('claimId') && !url.searchParams.has('selected')
    );
  });
});
