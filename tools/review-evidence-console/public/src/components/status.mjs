import { element, replaceChildren, text } from './dom.mjs';

let liveRegion;

export function createHeader(reviewerRole = 'Rishikues privatësie') {
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
    element('span', { attributes: { class: 'eyebrow' } }, [text('Local review fixture')]),
    element('span', { attributes: { class: 'brand__title' } }, [text('Review & Evidence Console')]),
  ]);
  const menu = element('details', { attributes: { class: 'local-menu' } }, [
    element('summary', {}, [text('Të dhëna lokale')]),
    element('p', {}, [text('Vetëm fixture repo-safe në këtë pajisje. Pa hyrje ose prodhim.')]),
  ]);
  return element('header', { attributes: { class: 'topbar' } }, [
    element('div', { attributes: { class: 'topbar__inner' } }, [
      identity,
      element('div', { attributes: { class: 'reviewer-context' } }, [
        element('span', { attributes: { class: 'role-badge' } }, [text(reviewerRole)]),
        element('span', { attributes: { class: 'save-state' } }, [text('Ruajtja lokale aktive')]),
        menu,
        liveRegion,
      ]),
    ]),
  ]);
}

export function announce(message) {
  if (liveRegion) replaceChildren(liveRegion, [text(message)]);
}
