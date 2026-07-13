export function workspaceFocusTarget({ focusHeading, focusControlId }, pendingFocus = null) {
  return pendingFocus ?? focusControlId ?? (focusHeading ? 'item-heading' : null);
}
