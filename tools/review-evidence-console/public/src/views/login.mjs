import { element, text } from '../components/dom.mjs';

const errorCopy = error =>
  error || 'Emri i përdoruesit ose fjalëkalimi nuk është i saktë.';

export function renderLogin({ pending = false, error, initialUsername = '', onSubmit = () => {} } = {}) {
  const username = element('input', {
    attributes: {
      id: 'username',
      name: 'username',
      type: 'text',
      autocomplete: 'username',
      'aria-invalid': String(Boolean(error)),
      value: initialUsername,
      required: '',
      'aria-describedby': error ? 'login-error' : 'login-help',
    },
  });
  const password = element('input', {
    attributes: {
      id: 'password',
      name: 'password',
      type: 'password',
      autocomplete: 'current-password',
      'aria-invalid': String(Boolean(error)),
      required: '',
      'aria-describedby': error ? 'login-error' : 'login-help',
    },
  });
  const form = element(
    'form',
    {
      attributes: {
        id: 'reviewer-login',
        class: 'auth-form',
        'aria-busy': String(pending),
      },
      on: {
        submit: event => {
          event.preventDefault();
          if (!pending) onSubmit({ username: username.value.trim(), password: password.value });
        },
      },
    },
    [
      element('label', { attributes: { for: 'username' } }, [text('Emri i përdoruesit')]),
      username,
      element('label', { attributes: { for: 'password' } }, [text('Fjalëkalimi')]),
      password,
      element('p', { attributes: { id: 'login-help', class: 'field-help' } }, [
        text('Përdorni llogarinë tuaj personale të shqyrtimit.'),
      ]),
      error
        ? element('p', { attributes: { id: 'login-error', role: 'alert', tabindex: '-1', class: 'auth-error' } }, [
            text(errorCopy(error)),
          ])
        : null,
      element(
        'button',
        {
          attributes: {
            id: 'login-submit',
            type: 'submit',
            class: 'primary-action',
            ...(pending ? { disabled: '', 'aria-disabled': 'true' } : {}),
          },
        },
        [text(pending ? 'Po verifikohet…' : 'Hyni')]
      ),
    ]
  );
  return element('section', { attributes: { class: 'auth-card', 'aria-labelledby': 'login-title' } }, [
    element('p', { attributes: { class: 'eyebrow' } }, [text('Qasje e kufizuar sipas rolit')]),
    element('h1', { attributes: { id: 'login-title' } }, [text('Hyni për të shqyrtuar')]),
    element('p', {}, [text('Do të shihni vetëm paketat që ju janë caktuar.')]),
    form,
  ]);
}
