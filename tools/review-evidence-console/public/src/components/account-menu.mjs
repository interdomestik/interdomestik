import { element, text } from './dom.mjs';

const ROLE_LABELS = Object.freeze({
  governance: 'Independent Business/Governance Reviewer',
  legal_privacy: 'Legal/Privacy Authority — MK',
  executive_owner: 'Executive/Business Owner',
  platform_guardian: 'Platform Technical Guardian / Consulted',
});

export function renderAccountMenu({ account, onLogout = () => {} }) {
  return element('details', { attributes: { class: 'account-menu' } }, [
    element('summary', {}, [text(account.displayName)]),
    element('div', { attributes: { class: 'account-menu__body' } }, [
      element('p', { attributes: { class: 'account-menu__name' } }, [text(account.displayName)]),
      element('p', { attributes: { class: 'account-menu__role', lang: 'en' } }, [
        text(ROLE_LABELS[account.role] ?? account.role),
      ]),
      element('button', { attributes: { type: 'button' }, on: { click: onLogout } }, [
        text('Dilni nga llogaria'),
      ]),
    ]),
  ]);
}
