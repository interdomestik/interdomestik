'use server';
import { headers } from 'next/headers';
import { executeM4QualificationAdminAssignment } from '@/server/operations/m4-qualification-admin-assignment';
import { executeM4QualificationAgentAssignment } from '@/server/operations/m4-qualification-agent-assignment';
import { executeM4QualificationStaffAssignment } from '@/server/operations/m4-qualification-staff-assignment';
import { invalid, settled, uncertain } from './action-input';
import { qualificationInput } from './fixture-scope';

export async function runAdminAssignment(_previous, form) {
  const input = qualificationInput(form, 'legacy-admin');
  if (!input) return invalid();
  try {
    const requestHeaders = await headers();
    return settled(
      input,
      await executeM4QualificationAdminAssignment({ ...input, requestHeaders })
    );
  } catch {
    return uncertain(input);
  }
}
export async function runAgentAssignment(_previous, form) {
  const input = qualificationInput(form, 'legacy-agent');
  if (!input) return invalid();
  try {
    const requestHeaders = await headers();
    return settled(
      input,
      await executeM4QualificationAgentAssignment({ ...input, requestHeaders })
    );
  } catch {
    return uncertain(input);
  }
}
export async function runStaffAssignment(_previous, form) {
  const input = qualificationInput(form, 'staff');
  if (!input) return invalid();
  try {
    const requestHeaders = await headers();
    return settled(
      input,
      await executeM4QualificationStaffAssignment({ ...input, requestHeaders })
    );
  } catch {
    return uncertain(input);
  }
}
