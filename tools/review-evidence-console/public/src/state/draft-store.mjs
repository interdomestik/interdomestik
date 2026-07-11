import { failure, isIsoDate, isRecord, storageFailure } from './storage-results.mjs';
import { validateDraftContext } from './draft-context-schema.mjs';

const SEGMENT = /^[a-zA-Z0-9._-]+$/;
const PREFIX = 'review-console:v1:draft:';
const requiredStrings = [
  'assignmentId',
  'packetId',
  'reviewerFixtureId',
  'packetVersion',
  'activeItem',
  'editorId',
];

function parseKey(key) {
  if (typeof key !== 'string' || !key.startsWith(PREFIX)) return null;
  const segments = key.slice(PREFIX.length).split(':');
  if (segments.length !== 3 || segments.some(value => !SEGMENT.test(value))) return null;
  return { assignmentId: segments[0], reviewerFixtureId: segments[1], packetVersion: segments[2] };
}

function validateDraft(key, draft, schemaVersion, contextSchema) {
  const identity = parseKey(key);
  if (!identity || !isRecord(draft) || draft.schemaVersion !== schemaVersion) return false;
  if (requiredStrings.some(field => typeof draft[field] !== 'string' || !draft[field]))
    return false;
  if (!isRecord(draft.itemDecisions) || !isIsoDate(draft.updatedAt)) return false;
  if (
    Object.hasOwn(draft, 'suggestionVersion') &&
    (!Number.isInteger(draft.suggestionVersion) || ![1, 2].includes(draft.suggestionVersion))
  ) {
    return false;
  }
  if (
    draft.suggestionVersion === 2 &&
    !validateDraftContext(draft.contextualNoteState, contextSchema)
  ) {
    return false;
  }
  return Object.entries(identity).every(([field, value]) => draft[field] === value);
}

export function composeDraftKey(parts) {
  const values = [parts?.assignmentId, parts?.reviewerFixtureId, parts?.packetVersion];
  if (values.some(value => typeof value !== 'string' || !SEGMENT.test(value))) {
    throw new TypeError(
      'Segmentet e çelësit të draftit duhet të jenë identifikues të sigurt për repo.'
    );
  }
  return `${PREFIX}${values.join(':')}`;
}

export function createDraftStore({
  storage = globalThis.localStorage,
  schemaVersion,
  contextSchema,
}) {
  const invalidKey = key =>
    parseKey(key)
      ? null
      : failure('invalid_data', 'Çelësi i draftit nuk i përket kësaj ruajtjeje.');
  return {
    load(key) {
      const keyFailure = invalidKey(key);
      if (keyFailure) return keyFailure;
      try {
        const text = storage.getItem(key);
        if (text === null) return failure('not_found', 'Drafti nuk u gjet.');
        let value;
        try {
          value = JSON.parse(text);
        } catch {
          return failure('invalid_data', 'Drafti i ruajtur nuk është JSON i vlefshëm.');
        }
        if (value?.schemaVersion !== schemaVersion) {
          return failure('schema_mismatch', 'Drafti i ruajtur përdor një skemë të papajtueshme.');
        }
        if (!validateDraft(key, value, schemaVersion, contextSchema)) {
          return failure('invalid_data', 'Drafti i ruajtur është i paplotë ose jokonsistent.');
        }
        return { ok: true, value };
      } catch (error) {
        return storageFailure(error);
      }
    },
    save(key, draft, expectedUpdatedAt) {
      const keyFailure = invalidKey(key);
      if (keyFailure) return keyFailure;
      if (!validateDraft(key, draft, schemaVersion, contextSchema)) {
        return failure('invalid_data', 'Drafti është i paplotë ose jokonsistent.');
      }
      try {
        const currentText = storage.getItem(key);
        if (currentText !== null) {
          let current;
          try {
            current = JSON.parse(currentText);
          } catch {
            return failure('conflict', 'Drafti i ruajtur ndryshoi në një skedë tjetër.');
          }
          if (current.updatedAt !== expectedUpdatedAt) {
            return failure('conflict', 'Drafti i ruajtur ndryshoi në një skedë tjetër.');
          }
        }
        storage.setItem(key, JSON.stringify(draft));
        return { ok: true, value: draft };
      } catch (error) {
        return storageFailure(error);
      }
    },
    remove(key) {
      const keyFailure = invalidKey(key);
      if (keyFailure) return keyFailure;
      try {
        storage.removeItem(key);
        return { ok: true, value: undefined };
      } catch (error) {
        return storageFailure(error);
      }
    },
    exportRecovery(key) {
      const keyFailure = invalidKey(key);
      if (keyFailure) return keyFailure;
      try {
        const value = storage.getItem(key);
        return value === null ? failure('not_found', 'Drafti nuk u gjet.') : { ok: true, value };
      } catch (error) {
        return storageFailure(error);
      }
    },
  };
}
