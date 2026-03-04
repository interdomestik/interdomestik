#!/usr/bin/env node

import crypto from 'node:crypto';

const DEFAULT_SEED_VERSION = 'v1';

function stableSort(value) {
  if (Array.isArray(value)) {
    return value.map(item => stableSort(item));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = stableSort(value[key]);
        return acc;
      }, {});
  }

  return value;
}

function normalizedScope(scope) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
    return {};
  }

  const allowedKeys = ['file_path', 'route', 'table', 'tenant'];
  const out = {};

  for (const key of allowedKeys) {
    if (typeof scope[key] === 'string' && scope[key].trim().length > 0) {
      out[key] = scope[key].trim();
    }
  }

  return out;
}

export function memoryIdSeedPayload(record) {
  return stableSort({
    seed_version: record?.id_seed_version || DEFAULT_SEED_VERSION,
    store_type: record?.store_type || '',
    trigger_signature: record?.trigger_signature || '',
    risk_class: record?.risk_class || '',
    scope: normalizedScope(record?.scope),
    lesson: typeof record?.lesson === 'string' ? record.lesson.trim() : '',
  });
}

export function computeDeterministicMemoryId(record) {
  const payload = JSON.stringify(memoryIdSeedPayload(record));
  const digest = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
  return `mem_${digest}`;
}

export { DEFAULT_SEED_VERSION };
