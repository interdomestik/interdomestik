import { db } from '@interdomestik/database';
import { memberReferralSettings } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { isMissingRelationError } from './errors';
import type {
  ActionResult,
  MemberReferralProgramSettings,
  MemberReferralSettingsInput,
} from './types';

const DEFAULT_SETTINGS: MemberReferralProgramSettings = {
  tenantId: '',
  enabled: false,
  rewardType: 'fixed',
  fixedRewardCents: 0,
  percentRewardBps: null,
  settlementMode: 'credit_only',
  payoutThresholdCents: 0,
  fraudReviewEnabled: false,
  currencyCode: 'EUR',
  qualifyingEventType: 'first_paid_membership',
};

type NormalizableSettingsRow = Omit<
  Partial<MemberReferralProgramSettings>,
  'fixedRewardCents' | 'percentRewardBps'
> & {
  fixedRewardCents?: number | null;
  percentRewardBps?: number | null;
};

function normalizeSettingsRow(
  tenantId: string,
  row?: NormalizableSettingsRow | null
): MemberReferralProgramSettings {
  const rewardType = row?.rewardType ?? DEFAULT_SETTINGS.rewardType;

  return {
    ...DEFAULT_SETTINGS,
    tenantId,
    ...row,
    rewardType,
    fixedRewardCents:
      rewardType === 'fixed' ? (row?.fixedRewardCents ?? DEFAULT_SETTINGS.fixedRewardCents) : null,
    percentRewardBps: rewardType === 'percent' ? (row?.percentRewardBps ?? 0) : null,
    payoutThresholdCents: row?.payoutThresholdCents ?? DEFAULT_SETTINGS.payoutThresholdCents,
    currencyCode: row?.currencyCode ?? DEFAULT_SETTINGS.currencyCode,
    qualifyingEventType: row?.qualifyingEventType ?? DEFAULT_SETTINGS.qualifyingEventType,
  };
}

export async function getMemberReferralProgramSettingsCore(params: {
  tenantId: string;
}): Promise<ActionResult<MemberReferralProgramSettings>> {
  try {
    const row = await db.query.memberReferralSettings.findFirst({
      where: eq(memberReferralSettings.tenantId, params.tenantId),
    });

    return {
      success: true,
      data: normalizeSettingsRow(
        params.tenantId,
        row as Partial<MemberReferralProgramSettings> | null
      ),
    };
  } catch (error) {
    if (isMissingRelationError(error)) {
      return {
        success: true,
        data: normalizeSettingsRow(params.tenantId, null),
      };
    }
    console.error('Error reading member referral settings:', error);
    return { success: false, error: 'Failed to read member referral settings' };
  }
}

export async function upsertMemberReferralProgramSettingsCore(params: {
  tenantId: string;
  settings: MemberReferralSettingsInput;
}): Promise<ActionResult<MemberReferralProgramSettings>> {
  const { tenantId, settings } = params;

  try {
    const current = await getMemberReferralProgramSettingsCore({ tenantId });
    if (!current.success) {
      return current;
    }

    const normalized = normalizeSettingsRow(tenantId, {
      ...current.data,
      ...settings,
    });

    const rows = await db
      .insert(memberReferralSettings)
      .values({
        id: nanoid(),
        tenantId,
        enabled: normalized.enabled,
        rewardType: normalized.rewardType,
        fixedRewardCents: normalized.rewardType === 'fixed' ? normalized.fixedRewardCents : null,
        percentRewardBps: normalized.percentRewardBps,
        referredMemberRewardType: 'fixed',
        referredMemberFixedRewardCents: 0,
        referredMemberPercentRewardBps: null,
        settlementMode: normalized.settlementMode,
        payoutThresholdCents: normalized.payoutThresholdCents,
        fraudReviewEnabled: normalized.fraudReviewEnabled,
        currencyCode: normalized.currencyCode,
        qualifyingEventType: normalized.qualifyingEventType,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: memberReferralSettings.tenantId,
        set: {
          enabled: normalized.enabled,
          rewardType: normalized.rewardType,
          fixedRewardCents: normalized.rewardType === 'fixed' ? normalized.fixedRewardCents : null,
          percentRewardBps: normalized.percentRewardBps,
          referredMemberRewardType: 'fixed',
          referredMemberFixedRewardCents: 0,
          referredMemberPercentRewardBps: null,
          settlementMode: normalized.settlementMode,
          payoutThresholdCents: normalized.payoutThresholdCents,
          fraudReviewEnabled: normalized.fraudReviewEnabled,
          currencyCode: normalized.currencyCode,
          qualifyingEventType: normalized.qualifyingEventType,
          updatedAt: new Date(),
        },
      })
      .returning({
        tenantId: memberReferralSettings.tenantId,
        enabled: memberReferralSettings.enabled,
        rewardType: memberReferralSettings.rewardType,
        fixedRewardCents: memberReferralSettings.fixedRewardCents,
        percentRewardBps: memberReferralSettings.percentRewardBps,
        settlementMode: memberReferralSettings.settlementMode,
        payoutThresholdCents: memberReferralSettings.payoutThresholdCents,
        fraudReviewEnabled: memberReferralSettings.fraudReviewEnabled,
        currencyCode: memberReferralSettings.currencyCode,
        qualifyingEventType: memberReferralSettings.qualifyingEventType,
      });

    const row = rows[0];
    if (!row) {
      return {
        success: false,
        error: 'Failed to upsert member referral settings',
      };
    }

    return {
      success: true,
      data: normalizeSettingsRow(tenantId, row as NormalizableSettingsRow),
    };
  } catch (error) {
    console.error('Error upserting member referral settings:', error);
    return { success: false, error: 'Failed to save member referral settings' };
  }
}
