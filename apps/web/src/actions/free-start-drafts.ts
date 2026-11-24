'use server';

import { headers } from 'next/headers';

import { withRequestAdmission } from '@/lib/privacy/require-member-acceptance';

import {
  createFreeStartDraftCore,
  deleteFreeStartDraftCore,
  getFreeStartDraftAccountCore,
  listFreeStartDraftsCore,
  resumeFreeStartDraftCore,
  updateFreeStartDraftCore,
} from './free-start-drafts/lifecycle.core';

export async function getFreeStartDraftAccount() {
  const requestHeaders = await headers();
  return withRequestAdmission(requestHeaders, () => getFreeStartDraftAccountCore(requestHeaders));
}

export async function createFreeStartDraft(input: unknown) {
  const requestHeaders = await headers();
  return withRequestAdmission(requestHeaders, () =>
    createFreeStartDraftCore(requestHeaders, input)
  );
}

export async function listFreeStartDrafts(input: unknown = {}) {
  const requestHeaders = await headers();
  return withRequestAdmission(requestHeaders, () => listFreeStartDraftsCore(requestHeaders, input));
}

export async function resumeFreeStartDraft(input: unknown) {
  const requestHeaders = await headers();
  return withRequestAdmission(requestHeaders, () =>
    resumeFreeStartDraftCore(requestHeaders, input)
  );
}

export async function updateFreeStartDraft(input: unknown) {
  const requestHeaders = await headers();
  return withRequestAdmission(requestHeaders, () =>
    updateFreeStartDraftCore(requestHeaders, input)
  );
}

export async function deleteFreeStartDraft(input: unknown) {
  const requestHeaders = await headers();
  return withRequestAdmission(requestHeaders, () =>
    deleteFreeStartDraftCore(requestHeaders, input)
  );
}
