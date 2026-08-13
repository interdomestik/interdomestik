import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import en from '../../../messages/en/claims.json';
import mk from '../../../messages/mk/claims.json';
import sq from '../../../messages/sq/claims.json';
import sr from '../../../messages/sr/claims.json';
import { SecureSaveBand } from '@/app/[locale]/components/home/free-start-intake-shell/secure-save-band';
import type { DraftSaveState } from '@/app/[locale]/components/home/free-start-intake-shell/types';
import { ClaimDraftIntake } from './index';

// prettier-ignore
const a = vi.hoisted(() => ({ create: vi.fn(), delete: vi.fn(), list: vi.fn(), resume: vi.fn(), update: vi.fn() }));
vi.mock('@/actions/free-start-drafts', () => ({
  createFreeStartDraft: a.create,
  deleteFreeStartDraft: a.delete,
  listFreeStartDrafts: a.list,
  resumeFreeStartDraft: a.resume,
  updateFreeStartDraft: a.update,
}));

// prettier-ignore
const saveStates: DraftSaveState[] = ['idle', 'saving', 'saved', 'dirty', 'loading', 'conflict', 'limit', 'invalid', 'unsupported', 'accountContext', 'error', 'deleted'];
// prettier-ignore
const claimCopy = {
  heading: 'Prepare your claim draft', supporting: 'Save the facts you have now and return later.',
  truth: 'Draft only — this does not create or submit a claim.', categoryHeading: 'Choose what happened',
  categoryBody: 'Vehicle and property preparation are available.', categoryContinue: 'Continue to details',
  unsupported: 'Not available in this draft', previewHeading: 'Review your preparation facts',
  previewBody: 'Save explicitly when these facts are ready.', backToDetails: 'Back to details',
  submitDisabled: 'Submit claim — requirements not met', submitExplanation: 'Submitting a claim requires active membership and a complete, saved draft with no unsaved changes. Saving the draft does not submit the claim.', submitMembershipExplanation: 'To submit a claim, you need an active membership. You can keep managing this saved draft; saving it does not submit the claim.', submitUnsavedExplanation: 'Save your changes before submitting. Saving changes does not submit the claim.',
  existingCaseSuccess: 'There is already a submitted case for this saved draft.',
};
// prettier-ignore
const secureCopy = {
  eyebrow: 'Draft', heading: 'Secure save', body: 'Body', privacy: 'Privacy', save: 'Save',
  saveChanges: 'Save changes', startAnother: 'Start another',
  status: Object.fromEntries(saveStates.map(state => [state, state])),
  manage: { delete: 'Delete', emptyBody: 'None', emptyHeading: 'None', heading: 'Manage', inProgress: 'In progress',
    loadMore: 'More', loading: 'Loading', open: 'Manage', ready: 'Ready', resume: 'Resume' },
  delete: { body: 'Body', cancel: 'Cancel', confirm: 'Delete', heading: 'Delete?' },
  otp: { body: 'Body', changeEmail: 'Change', codeLabel: 'Code', emailLabel: 'Email', heading: 'Verify',
    send: 'Send', sending: 'Sending', sent: 'Sent', verify: 'Verify', verifying: 'Verifying', errors: {} },
};
vi.mock('next-intl', () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  useLocale: () => 'en',
  useTranslations: (namespace: string) => {
    // prettier-ignore
    const t = ((key: string) => key) as
      ((key: string) => string) & { raw: (key: string) => unknown };
    t.raw = key =>
      namespace === 'claims' && key === 'draftIntakeCopy'
        ? JSON.stringify(claimCopy)
        : JSON.stringify(
            key === 'secureSave'
              ? secureCopy
              : {
                  accountContext: 'accountContext',
                  invalid: 'invalid',
                  unsupported: 'unsupported',
                }
          );
    return t;
  },
}));

function lifecycle(state: DraftSaveState) {
  const noop = vi.fn();
  // prettier-ignore
  return { active: null, hasUnsavedChanges: false, identityKey: 0, intent: null, items: [],
    loadMore: noop, nextCursor: null, onVerified: noop, openManage: noop, openSave: noop,
    remove: noop, resume: noop, saveChanges: noop, startAnother: noop, state, verified: true };
}

function enter(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('ClaimDraftIntake', () => {
  it('keeps manager-only closed until explicit Manage then Resume', async () => {
    // prettier-ignore
    const draft = { category: 'property', clientRequestId: 'req-1', counterparty: 'Insurer', createdAt: '2026-07-01T00:00:00.000Z', desiredOutcome: 'repair', id: 'draft-1', incidentDate: '2026-07-01', issueType: 'water_damage', resumeStep: 'preview', summary: 'Saved facts.', updatedAt: '2026-07-02T00:00:00.000Z', version: 1 };
    a.list.mockResolvedValueOnce({ items: [draft], nextCursor: null, ok: true });
    a.resume.mockResolvedValueOnce({ draft, ok: true });
    // prettier-ignore
    render(<ClaimDraftIntake freeStartMessages={{}} locale="en" managerOnly neutralOtpHost={location.host} tenantId="tenant_ks" />);
    expect(screen.queryByTestId('claim-draft-main-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('free-start-save-open')).not.toBeInTheDocument();
    expect(Object.values(a).every(action => action.mock.calls.length === 0)).toBe(true);
    fireEvent.click(await screen.findByTestId('free-start-manage-open'));
    fireEvent.click(await screen.findByRole('button', { name: 'Resume' }));
    expect(await screen.findByRole('button', { name: claimCopy.submitDisabled })).toBeDisabled();
    expect(screen.getByText('Saved facts.')).toBeVisible();
    expect(screen.queryByTestId('free-start-start-another')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: claimCopy.backToDetails }));
    enter('details.summary', 'Changed facts.');
    expect(await screen.findByTestId('free-start-save-changes')).toBeVisible();
    vi.clearAllMocks();
  });

  it('is explicit-save only, blocks injury, and keeps submit inert', async () => {
    render(<ClaimDraftIntake freeStartMessages={{}} locale="en" tenantId="tenant_ks" />);
    expect(screen.getByRole('heading', { name: claimCopy.heading })).toBeVisible();
    expect(screen.getByText(claimCopy.truth)).toBeVisible();
    expect(screen.getByTestId('claim-draft-category-injury')).toBeDisabled();
    fireEvent.click(screen.getByTestId('claim-draft-category-vehicle'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to details' }));
    enter('details.issueType', 'collision');
    enter('details.incidentDate', '2026-07-20');
    enter('details.counterparty', 'Operator');
    enter('details.desiredOutcome', 'repair');
    enter('details.summary', 'Prepared facts.');
    fireEvent.click(screen.getByRole('button', { name: 'details.continue' }));
    expect(await screen.findByTestId('claim-draft-account-context')).toBeVisible();
    const submit = screen.getByRole('button', { name: claimCopy.submitDisabled });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription(claimCopy.submitExplanation);
    expect(submit.closest('form')).toBeNull();
    for (const key of ['Enter', ' ']) fireEvent.keyDown(submit, { key });
    expect(Object.values(a).every(action => action.mock.calls.length === 0)).toBe(true);
  });

  it.each(saveStates)('keeps the reused live save state perceivable: %s', async state => {
    render(
      <SecureSaveBand
        lifecycle={lifecycle(state) as never}
        locale="en"
        neutralOtpHost={globalThis.location.host}
      />
    );
    await waitFor(() =>
      expect(screen.getByTestId('free-start-save-status')).toHaveAttribute('data-state', state)
    );
  });

  it('keeps required truth keys present across EN, SQ, SR, and MK', () => {
    // prettier-ignore
    const copies = [en, sq, mk, sr].map(messages => JSON.parse(messages.claims.draftIntakeCopy) as Record<string, string>);
    for (const copy of copies) {
      expect(Object.values(copy).every(value => value.trim())).toBe(true);
    }
    // prettier-ignore
    expect([copies[0].heading, ...copies.flatMap(copy => [copy.submitDisabled, copy.submitExplanation, copy.submitMembershipExplanation, copy.submitUnsavedExplanation])]).toEqual(['Prepare your claim draft', 'Submit claim — requirements not met', 'Submitting a claim requires active membership and a complete, saved draft with no unsaved changes. Saving the draft does not submit the claim.', 'To submit a claim, you need an active membership. You can keep managing this saved draft; saving it does not submit the claim.', 'Save your changes before submitting. Saving changes does not submit the claim.', 'Dorëzo kërkesën — kushtet nuk janë plotësuar', 'Për dorëzim duhen anëtarësim aktiv dhe një skicë e plotë e ruajtur, pa ndryshime të paruajtura. Ruajtja e skicës nuk e dorëzon kërkesën.', 'Për ta dorëzuar kërkesën, ju duhet anëtarësim aktiv. Mund të vazhdoni ta menaxhoni këtë skicë të ruajtur; ruajtja e saj nuk e dorëzon kërkesën.', 'Ruajini ndryshimet para dorëzimit. Ruajtja e ndryshimeve nuk e dorëzon kërkesën.', 'Поднеси барање — условите не се исполнети', 'За поднесување се потребни активно членство и целосен зачуван нацрт без незачувани измени. Зачувувањето на нацртот не го поднесува барањето.', 'За да поднесете барање, ви треба активно членство. Може да продолжите да управувате со овој зачуван нацрт; неговото зачувување не го поднесува барањето.', 'Зачувајте ги измените пред поднесување. Зачувувањето на измените не го поднесува барањето.', 'Podnesi zahtev — uslovi nisu ispunjeni', 'Za podnošenje su potrebni aktivno članstvo i potpun sačuvan nacrt bez nesačuvanih izmena. Čuvanje nacrta ne podnosi zahtev.', 'Da biste podneli zahtev, potrebno vam je aktivno članstvo. Možete nastaviti da upravljate ovim sačuvanim nacrtom; njegovo čuvanje ne podnosi zahtev.', 'Sačuvajte izmene pre podnošenja. Čuvanje izmena ne podnosi zahtev.']);
    // prettier-ignore
    expect([en.claims.wizard.submit_success, sq.claims.wizard.submit_success, mk.claims.wizard.submit_success, sr.claims.wizard.submit_success]).toEqual(['Case submitted. You can track it from the dashboard. Your saved draft stays separate; if you edit or delete the draft later, that does not change or delete this case.', 'Rasti u dërgua. Mund ta ndiqni nga paneli. Skica juaj e ruajtur mbetet e veçantë; nëse e ndryshoni ose e fshini skicën më vonë, kjo nuk e ndryshon dhe as nuk e fshin këtë rast.', 'Случајот е поднесен. Можете да го следите од контролната табла. Зачуваниот нацрт останува одделен; ако подоцна го измените или избришете нацртот, тоа не го менува ниту го брише овој случај.', 'Slučaj je podnet. Možete ga pratiti sa kontrolne table. Sačuvani nacrt ostaje odvojen; ako nacrt kasnije izmenite ili izbrišete, to ne menja niti briše ovaj slučaj.']);
    // prettier-ignore
    expect(copies.map(copy => copy.existingCaseSuccess)).toEqual(['There is already a submitted case for this saved draft. You can track it from the dashboard. If you edit or delete the saved draft later, that does not change or delete the case.', 'Për këtë skicë të ruajtur ekziston tashmë një rast i dërguar. Mund ta ndiqni nga paneli. Nëse e ndryshoni ose e fshini skicën e ruajtur më vonë, kjo nuk e ndryshon dhe as nuk e fshin rastin.', 'За овој зачуван нацрт веќе постои поднесен случај. Можете да го следите од контролната табла. Ако подоцна го измените или избришете зачуваниот нацрт, тоа не го менува ниту го брише случајот.', 'Za ovaj sačuvani nacrt već postoji podnet slučaj. Možete ga pratiti sa kontrolne table. Ako kasnije izmenite ili izbrišete sačuvani nacrt, to ne menja niti briše slučaj.']);
  });
});
