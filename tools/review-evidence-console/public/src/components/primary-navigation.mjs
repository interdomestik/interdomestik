import { element, text } from './dom.mjs';

function navigationLink(href, label, current) {
  return element(
    'a',
    {
      attributes: {
        class: `primary-nav__link${current ? ' primary-nav__link--active' : ''}`,
        href,
        ...(current ? { 'aria-current': 'page' } : {}),
      },
    },
    [text(label)]
  );
}

export function renderPrimaryNavigation(current = 'inbox') {
  return element(
    'nav',
    { attributes: { class: 'primary-nav', 'aria-label': 'Navigimi kryesor' } },
    [
      navigationLink('#/', 'Detyrat', current !== 'history'),
      navigationLink('#/history', 'Historia', current === 'history'),
    ]
  );
}
