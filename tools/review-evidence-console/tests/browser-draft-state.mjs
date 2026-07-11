export async function waitForPersistedDraft(page, itemIds) {
  await page.waitForFunction(ids => {
    const key = Object.keys(localStorage).find(value =>
      value.startsWith('review-console:v1:draft:')
    );
    const draft = key && JSON.parse(localStorage.getItem(key));
    return (
      draft?.itemDecisions?.[ids[0]]?.concreteAnswer === 'Përgjigjja finale e redaktuar' &&
      draft?.itemDecisions?.[ids[1]]?.responses?.medicalBoundary === 'allowed'
    );
  }, itemIds);
}
