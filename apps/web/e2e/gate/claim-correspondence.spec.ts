import { expect, loginAtDoor, test } from '../fixtures/one-door.fixture';
import { formatPilotDateTime } from '../../src/lib/utils/date';
import { gotoApp } from '../utils/navigation';
import {
  copy,
  createCorrespondenceCase,
  fillContact,
  instruments,
  openQueue,
  recordBasis,
  recordForm,
  recordOutgoing,
  registerRow,
  saveFollowUp,
  sentDocument,
  uploadCasePdf,
} from './claim-correspondence.fixture';

test('assigned staff record legal bases, document disclosure, and an overdue unanswered contact', async ({
  door,
}, info) => {
  info.skip(info.project.name !== 'gate-ks-sq', 'The fixture uses the Kosovo staff and member');
  test.setTimeout(120_000);
  const { page, origin, locale } = door;
  const claimId = await createCorrespondenceCase();
  await loginAtDoor(page, origin, locale, 'KS_STAFF', info);
  const detail = `/${locale}/staff/claims/${claimId}`;
  await gotoApp(page, detail, info, { baseURL: origin, marker: 'staff-claim-detail-ready' });
  const list = page.getByTestId('staff-correspondence-list');
  await expect(list).toHaveCount(1);
  await expect(list).toContainText(copy.list.empty);
  await expect(
    page.getByRole('region', { name: copy.caseFields.title, exact: true, includeHidden: true })
  ).toHaveCount(1);

  for (const name of [...instruments.map(instrument => instrument.file), sentDocument]) {
    await uploadCasePdf(page, name);
  }
  for (const instrument of instruments) await recordBasis(page, instrument);

  const answered = 'First synthetic contact with a document';
  const unanswered = 'Second synthetic contact awaiting a reply';
  await recordOutgoing(page, answered, true);
  await expect(registerRow(page, answered)).toContainText(sentDocument);
  await recordOutgoing(page, unanswered, false);
  await saveFollowUp(registerRow(page, answered), '2020-01-06T12:00');
  await saveFollowUp(registerRow(page, unanswered), '2020-01-07T12:00');
  // The follow-up inputs are UTC; the queue shows the same instants in pilot time.
  const firstFollowUp = '2020-01-06T12:00:00.000Z';
  const secondFollowUp = '2020-01-07T12:00:00.000Z';
  await expect(page.getByTestId('staff-correspondence-overdue')).toHaveCount(2);

  const queue = await page.context().newPage();
  try {
    const { row, overdue } = await openQueue(queue, claimId, origin, locale, info);
    await expect(overdue).toBeVisible();
    await expect(overdue).toContainText(formatPilotDateTime(firstFollowUp, locale, ''));

    const form = recordForm(page);
    await form.getByLabel(copy.entry.directionLabel).selectOption('inbound');
    const reply = 'Synthetic insurer reply';
    await fillContact(form, reply);
    const replyOption = form.getByRole('option').filter({ hasText: answered });
    await expect(replyOption).toHaveCount(1);
    await form
      .getByLabel(copy.entry.replyTo)
      .selectOption({ label: await replyOption.innerText() });
    await form.getByRole('button', { name: copy.entry.record }).click();
    await expect(registerRow(page, reply)).toBeVisible();
    await expect(
      registerRow(page, answered).getByTestId('staff-correspondence-answered')
    ).toBeVisible();
    await expect(
      registerRow(page, unanswered).getByTestId('staff-correspondence-overdue')
    ).toBeVisible();
    await expect(page.getByTestId('staff-correspondence-overdue')).toHaveCount(1);

    // The answered contact's deadline no longer counts; the remaining unanswered one does.
    await queue.reload();
    await expect(overdue).toBeVisible();
    await expect(overdue).toContainText(formatPilotDateTime(secondFollowUp, locale, ''));
    await expect(overdue).not.toContainText(formatPilotDateTime(firstFollowUp, locale, ''));
    await expect(row).toHaveCount(1);
  } finally {
    await queue.close();
  }
});
