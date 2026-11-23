import { notificationDeliveries, userLocalePreferences } from '@interdomestik/database/schema';
import { recipientLocales } from '@interdomestik/domain-communications/recipient-locale';
import { describe, expect, it } from 'vitest';
import { LOCALES } from './locales';

// Code declares the recipient locales once (`recipientLocales`). The schema keeps two literal
// lists, because a tail table may import only table bindings: the preferred locale and the
// delivery locale. All three must equal the catalogue.
describe('stored locale lists', () => {
  it('equal the message catalogue, in order', () => {
    expect(recipientLocales).toEqual(LOCALES);
    expect(userLocalePreferences.locale.enumValues).toEqual([...LOCALES]);
    expect(notificationDeliveries.locale.enumValues).toEqual([...LOCALES]);
  });
});
