import { describe, expect, it } from 'vitest';
import AdminNotFound from '../../not-found';
import BranchNotFound from './not-found';

describe('admin branch detail not-found boundary', () => {
  it('renders the shared localized admin not-found page inside the branch segment', () => {
    expect(BranchNotFound).toBe(AdminNotFound);
  });
});
