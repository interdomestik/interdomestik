import { renderLogin } from '../views/login.mjs';

const ERRORS = Object.freeze({
  authentication_failed: 'Emri i përdoruesit ose fjalëkalimi nuk është i saktë.',
  forbidden: 'Kërkesa u refuzua. Rifreskoni faqen dhe provoni përsëri.',
  rate_limited: 'Shumë tentativa. Provoni përsëri më vonë.',
  session_expired: 'Sesioni ka përfunduar. Hyni përsëri.',
  unavailable: 'Shërbimi i shqyrtimit nuk është i disponueshëm. Provoni përsëri më vonë.',
});

export function renderAuthView(state, onSubmit) {
  return renderLogin({
    pending: state.status === 'authenticating' || state.status === 'checking',
    error: ERRORS[state.reason],
    initialUsername: state.username,
    onSubmit,
  });
}
