const SEGMENT = /^[a-zA-Z0-9._-]+$/;
const INBOX = Object.freeze({ name: 'inbox' });

function segments(hash) {
  if (typeof hash !== 'string' || !hash.startsWith('#/')) return null;
  try {
    const values = hash.slice(2).split('/').filter(Boolean).map(decodeURIComponent);
    return values.every(safe) ? values : null;
  } catch {
    return null;
  }
}

export function parseRoute(hash) {
  const values = segments(hash);
  if (!values) return INBOX;
  if (values.length === 0) return INBOX;
  if (values.length === 1 && values[0] === 'history') return { name: 'history' };
  if (values.length === 2 && values[0] === 'receipt') {
    return { name: 'receipt', receiptId: values[1] };
  }
  if (values.length === 3 && values[0] === 'receipt' && values[2] === 'correct') {
    return { name: 'receipt', receiptId: values[1], correcting: true };
  }
  if (values.length === 3 && values[0] === 'review') {
    return values[2] === 'validate'
      ? { name: 'validation', assignmentId: values[1] }
      : { name: 'workspace', assignmentId: values[1], itemId: values[2] };
  }
  return INBOX;
}

function safe(value) {
  return typeof value === 'string' && value !== '.' && value !== '..' && SEGMENT.test(value);
}

export function formatRoute(route) {
  if (route?.name === 'inbox') return '#/';
  if (route?.name === 'history') return '#/history';
  if (route?.name === 'receipt' && route.correcting === true && safe(route.receiptId)) {
    return `#/receipt/${route.receiptId}/correct`;
  }
  if (route?.name === 'receipt' && safe(route.receiptId)) return `#/receipt/${route.receiptId}`;
  if (route?.name === 'validation' && safe(route.assignmentId)) {
    return `#/review/${route.assignmentId}/validate`;
  }
  if (
    route?.name === 'workspace' &&
    safe(route.assignmentId) &&
    safe(route.itemId) &&
    route.itemId !== 'validate'
  ) {
    return `#/review/${route.assignmentId}/${route.itemId}`;
  }
  return '#/';
}
