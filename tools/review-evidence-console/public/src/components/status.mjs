import { element, replaceChildren, text } from './dom.mjs';
import { renderPrimaryNavigation } from './primary-navigation.mjs';

let liveRegion;

export function createHeader(
  reviewerRole = 'Rishikues privatësie',
  saveStatus = 'Ruajtja lokale aktive',
  accountMenu = undefined
) {
  liveRegion = element('span', {
    attributes: {
      class: 'sr-only',
      role: 'status',
      'aria-live': 'polite',
      'aria-atomic': 'true',
      'data-live-region': '',
    },
  });
  const identity = element('div', { attributes: { class: 'brand' } }, [
    element('span', { attributes: { class: 'brand__mark', 'aria-hidden': 'true' } }, [text('ID')]),
    element('span', { attributes: { class: 'brand__copy' } }, [
      element('span', { attributes: { class: 'eyebrow' } }, [text('Shqyrtim lokal i evidencës')]),
      element('span', { attributes: { class: 'brand__title', lang: 'en' } }, [
        text('Review & Evidence Console'),
      ]),
    ]),
  ]);
  const menu =
    accountMenu ??
    element('details', { attributes: { class: 'local-menu' } }, [
      element('summary', {}, [text('Të dhëna lokale')]),
      element('p', {}, [text('Vetëm mostër e sigurt për repo në këtë pajisje. Pa prodhim.')]),
    ]);
  const current = globalThis.location?.hash?.startsWith('#/history') ? 'history' : 'inbox';
  return element('header', { attributes: { class: 'topbar' } }, [
    element('div', { attributes: { class: 'topbar__inner' } }, [
      identity,
      renderPrimaryNavigation(current),
      element('div', { attributes: { class: 'reviewer-context' } }, [
        element('span', { attributes: { class: 'role-badge' } }, [text(reviewerRole)]),
        element('span', { attributes: { class: 'save-state', 'aria-live': 'polite' } }, [
          text(saveStatus),
        ]),
        menu,
        liveRegion,
      ]),
    ]),
  ]);
}

export function announce(message) {
  if (liveRegion) replaceChildren(liveRegion, [text(message)]);
}
