import { renderAccountMenu } from '../components/account-menu.mjs';
import { element, text } from '../components/dom.mjs';
import { createHeader } from '../components/status.mjs';

export function applicationShell({
  content,
  role = 'Rishikues privatësie',
  saveStatus,
  account,
  onLogout,
}) {
  const menu = account ? renderAccountMenu({ account, onLogout }) : undefined;
  return [
    element('a', { attributes: { class: 'skip-link', href: '#main' } }, [
      text('Kalo te përmbajtja'),
    ]),
    createHeader(role, saveStatus, menu),
    element('main', { attributes: { class: 'page-shell', id: 'main', tabindex: '-1' } }, [
      content,
    ]),
  ];
}

export function focusControl(controlId) {
  const direct = document.querySelector(`#${controlId}`);
  const grouped = direct ?? document.querySelector(`[name="${controlId}"]`);
  grouped?.focus();
}
