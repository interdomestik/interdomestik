import assert from 'node:assert/strict';
import test from 'node:test';

import { setDocument } from '../public/src/components/dom.mjs';
import { renderAccountMenu } from '../public/src/components/account-menu.mjs';
import { renderLogin } from '../public/src/views/login.mjs';
import { byId, copy, fakeDocument, walk } from './fake-dom.mjs';

setDocument(fakeDocument);

test('login renders Albanian labels, generic error, and accessible pending state', () => {
  const submitted = [];
  const view = renderLogin({
    pending: true,
    initialUsername: 'gazmend',
    error: 'Emri i përdoruesit ose fjalëkalimi nuk është i saktë.',
    onSubmit: value => submitted.push(value),
  });
  assert.match(copy(view), /Hyni për të shqyrtuar/);
  assert.match(copy(view), /Emri i përdoruesit/);
  assert.match(copy(view), /Fjalëkalimi/);
  assert.match(copy(view), /nuk është i saktë/);
  assert.equal(byId(view, 'login-error').attributes.role, 'alert');
  assert.equal(byId(view, 'reviewer-login').attributes['aria-busy'], 'true');
  assert.equal(byId(view, 'login-submit').attributes.disabled, '');
  assert.equal(byId(view, 'username').attributes.autocomplete, 'username');
  assert.equal(byId(view, 'username').attributes.value, 'gazmend');
  assert.equal(byId(view, 'password').attributes.autocomplete, 'current-password');
  assert.deepEqual(submitted, []);
});

test('login submits only username and password from native controls', () => {
  const submitted = [];
  const view = renderLogin({ onSubmit: value => submitted.push(value) });
  byId(view, 'username').value = 'gazmend';
  byId(view, 'password').value = 'secret';
  const form = byId(view, 'reviewer-login');
  let prevented = false;
  form.listeners.submit({ preventDefault: () => (prevented = true) });
  assert.equal(prevented, true);
  assert.deepEqual(submitted, [{ username: 'gazmend', password: 'secret' }]);
});

test('account menu exposes display name, canonical role, and logout', () => {
  let loggedOut = false;
  const menu = renderAccountMenu({
    account: { displayName: 'Gazmend Abazi', role: 'governance' },
    onLogout: () => (loggedOut = true),
  });
  assert.match(copy(menu), /Gazmend Abazi/);
  assert.match(copy(menu), /Independent Business\/Governance Reviewer/);
  const button = walk(menu).find(node => node.tagName === 'BUTTON');
  button.listeners.click();
  assert.equal(loggedOut, true);
});
