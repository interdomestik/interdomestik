'use server';

import { headers } from 'next/headers';

import {
  createFreeStartDraftCore,
  deleteFreeStartDraftCore,
  listFreeStartDraftsCore,
  resumeFreeStartDraftCore,
  updateFreeStartDraftCore,
} from './free-start-drafts/lifecycle.core';

export async function createFreeStartDraft(input: unknown) {
  return createFreeStartDraftCore(await headers(), input);
}

export async function listFreeStartDrafts(input: unknown = {}) {
  return listFreeStartDraftsCore(await headers(), input);
}

export async function resumeFreeStartDraft(input: unknown) {
  return resumeFreeStartDraftCore(await headers(), input);
}

export async function updateFreeStartDraft(input: unknown) {
  return updateFreeStartDraftCore(await headers(), input);
}

export async function deleteFreeStartDraft(input: unknown) {
  return deleteFreeStartDraftCore(await headers(), input);
}
