'use client';

import {
  getAllCommissions,
  getGlobalCommissionSummary,
  updateCommissionStatus,
} from '@/actions/commissions.admin';
import { Commission, CommissionStatus, CommissionSummary } from '@/actions/commissions.types';
import {
  getMemberReferralProgramSettings,
  listMemberReferralRewards,
  updateMemberReferralProgramSettings,
  updateMemberReferralRewardStatus,
  type MemberReferralAdminRewardRow,
  type MemberReferralProgramSettings,
} from '@/actions/member-referrals';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Input,
  Label,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui';
import { Check, Clock, DollarSign } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';

const EMPTY_REFERRAL_SETTINGS: MemberReferralProgramSettings = {
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

const REFERRAL_STATUS_TRANSITIONS: Record<
  MemberReferralAdminRewardRow['status'],
  Array<MemberReferralAdminRewardRow['status']>
> = {
  pending: ['approved', 'void'],
  approved: ['credited', 'paid', 'void'],
  credited: ['paid', 'void'],
  paid: [],
  void: [],
};

export default function AdminCommissionsPage() {
  const t = useTranslations('admin.commissions_page');
  const locale = useLocale();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [summary, setSummary] = useState<CommissionSummary | null>(null);
  const [referralRewards, setReferralRewards] = useState<MemberReferralAdminRewardRow[]>([]);
  const [referralSettings, setReferralSettings] =
    useState<MemberReferralProgramSettings>(EMPTY_REFERRAL_SETTINGS);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    const [commResult, sumResult, settingsResult, rewardsResult] = await Promise.all([
      getAllCommissions(),
      getGlobalCommissionSummary(),
      getMemberReferralProgramSettings(),
      listMemberReferralRewards({ limit: 50 }),
    ]);
    if (commResult.success && commResult.data) setCommissions(commResult.data);
    if (sumResult.success && sumResult.data) setSummary(sumResult.data);
    if (settingsResult.success && settingsResult.data) {
      setReferralSettings(settingsResult.data);
    }
    if (rewardsResult.success && rewardsResult.data) {
      setReferralRewards(rewardsResult.data);
    }
  }

  function handleStatusChange(id: string, newStatus: CommissionStatus) {
    startTransition(async () => {
      const result = await updateCommissionStatus(id, newStatus);
      if (result.success) {
        await loadData();
      }
    });
  }

  function handleReferralStatusChange(
    rewardId: string,
    newStatus: MemberReferralAdminRewardRow['status']
  ) {
    startTransition(async () => {
      const result = await updateMemberReferralRewardStatus(rewardId, newStatus);
      if (result.success) {
        await loadData();
      }
    });
  }

  function handleSettingsChange<Key extends keyof MemberReferralProgramSettings>(
    key: Key,
    value: MemberReferralProgramSettings[Key]
  ) {
    setReferralSettings(current => ({
      ...current,
      [key]: value,
    }));
  }

  function handleSaveReferralSettings() {
    startTransition(async () => {
      const result = await updateMemberReferralProgramSettings({
        enabled: referralSettings.enabled,
        rewardType: referralSettings.rewardType,
        fixedRewardCents:
          referralSettings.rewardType === 'fixed' ? (referralSettings.fixedRewardCents ?? 0) : null,
        percentRewardBps:
          referralSettings.rewardType === 'percent'
            ? (referralSettings.percentRewardBps ?? 0)
            : null,
        settlementMode: referralSettings.settlementMode,
        payoutThresholdCents: referralSettings.payoutThresholdCents,
        fraudReviewEnabled: referralSettings.fraudReviewEnabled,
        currencyCode: referralSettings.currencyCode,
        qualifyingEventType: referralSettings.qualifyingEventType,
      });

      if (result.success && result.data) {
        setReferralSettings(result.data);
      }
    });
  }

  const formatAmount = (amount: string, currency = 'EUR') => {
    return new Intl.NumberFormat(toIntlLocale(locale), { style: 'currency', currency }).format(
      Number.parseFloat(amount)
    );
  };

  const formatRewardAmount = (reward: MemberReferralAdminRewardRow) =>
    new Intl.NumberFormat(toIntlLocale(locale), {
      style: 'currency',
      currency: reward.currencyCode,
    }).format(reward.rewardCents / 100);

  const formatSettingsAmount = (amountCents: number) =>
    new Intl.NumberFormat(toIntlLocale(locale), {
      style: 'currency',
      currency: referralSettings.currencyCode || 'EUR',
    }).format(amountCents / 100);

  const formatDate = (value: string | Date | null | undefined) => {
    if (!value) return '-';
    return new Intl.DateTimeFormat(toIntlLocale(locale), { dateStyle: 'medium' }).format(
      typeof value === 'string' ? new Date(value) : value
    );
  };

  const availableReferralStatusOptions = (status: MemberReferralAdminRewardRow['status']) => {
    const nextStatuses = REFERRAL_STATUS_TRANSITIONS[status] ?? [];
    return [status, ...nextStatuses];
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {summary ? (
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-muted-foreground">{t('summary.pending')}</span>
              </div>
              <p className="text-2xl font-bold">€{summary.totalPending.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">
                {t('summary.items', { count: summary.pendingCount })}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-muted-foreground">{t('summary.approved')}</span>
              </div>
              <p className="text-2xl font-bold">€{summary.totalApproved.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">
                {t('summary.items', { count: summary.approvedCount })}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-500" />
                <span className="text-sm text-muted-foreground">{t('summary.paid')}</span>
              </div>
              <p className="text-2xl font-bold">€{summary.totalPaid.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">
                {t('summary.items', { count: summary.paidCount })}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="text-sm text-muted-foreground">{t('summary.total_owed')}</span>
              </div>
              <p className="text-2xl font-bold">
                €{(summary.totalPending + summary.totalApproved).toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('summary.items', {
                  count: summary.pendingCount + summary.approvedCount,
                })}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="member-referrals-enabled">{t('settings.enable_title')}</Label>
              <p className="text-sm text-muted-foreground">{t('settings.enable_description')}</p>
            </div>
            <Checkbox
              id="member-referrals-enabled"
              checked={referralSettings.enabled}
              onCheckedChange={checked => handleSettingsChange('enabled', Boolean(checked))}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="reward-type">{t('settings.reward_type')}</Label>
              <Select
                value={referralSettings.rewardType}
                onValueChange={value =>
                  handleSettingsChange(
                    'rewardType',
                    value as MemberReferralProgramSettings['rewardType']
                  )
                }
                disabled={isPending}
              >
                <SelectTrigger id="reward-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">{t('reward_types.fixed')}</SelectItem>
                  <SelectItem value="percent">{t('reward_types.percent')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="settlement-mode">{t('settings.settlement_mode')}</Label>
              <Select
                value={referralSettings.settlementMode}
                onValueChange={value =>
                  handleSettingsChange(
                    'settlementMode',
                    value as MemberReferralProgramSettings['settlementMode']
                  )
                }
                disabled={isPending}
              >
                <SelectTrigger id="settlement-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit_only">{t('settlement_modes.credit_only')}</SelectItem>
                  <SelectItem value="credit_or_payout">
                    {t('settlement_modes.credit_or_payout')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {referralSettings.rewardType === 'fixed' ? (
              <div className="space-y-2">
                <Label htmlFor="fixed-reward-cents">{t('settings.fixed_reward')}</Label>
                <Input
                  id="fixed-reward-cents"
                  type="number"
                  min={0}
                  value={referralSettings.fixedRewardCents ?? 0}
                  onChange={event =>
                    handleSettingsChange('fixedRewardCents', Number(event.target.value) || 0)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.current_reward', {
                    amount: formatSettingsAmount(referralSettings.fixedRewardCents ?? 0),
                  })}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="percent-reward-bps">{t('settings.percent_reward')}</Label>
                <Input
                  id="percent-reward-bps"
                  type="number"
                  min={0}
                  max={10000}
                  value={referralSettings.percentRewardBps ?? 0}
                  onChange={event =>
                    handleSettingsChange('percentRewardBps', Number(event.target.value) || 0)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.current_reward', {
                    amount: `${((referralSettings.percentRewardBps ?? 0) / 100).toFixed(2)}%`,
                  })}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="payout-threshold-cents">{t('settings.payout_threshold')}</Label>
              <Input
                id="payout-threshold-cents"
                type="number"
                min={0}
                value={referralSettings.payoutThresholdCents}
                onChange={event =>
                  handleSettingsChange('payoutThresholdCents', Number(event.target.value) || 0)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency-code">{t('settings.currency_code')}</Label>
              <Input
                id="currency-code"
                maxLength={3}
                value={referralSettings.currencyCode}
                onChange={event =>
                  handleSettingsChange('currencyCode', event.target.value.toUpperCase())
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="qualifying-event-type">{t('settings.qualifying_event')}</Label>
              <Select
                value={referralSettings.qualifyingEventType}
                onValueChange={value =>
                  handleSettingsChange(
                    'qualifyingEventType',
                    value as MemberReferralProgramSettings['qualifyingEventType']
                  )
                }
                disabled={isPending}
              >
                <SelectTrigger id="qualifying-event-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="first_paid_membership">
                    {t('qualifying_event_types.first_paid_membership')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="fraud-review-enabled">{t('settings.fraud_review_title')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('settings.fraud_review_description')}
              </p>
            </div>
            <Checkbox
              id="fraud-review-enabled"
              checked={referralSettings.fraudReviewEnabled}
              onCheckedChange={checked =>
                handleSettingsChange('fraudReviewEnabled', Boolean(checked))
              }
            />
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleSaveReferralSettings} disabled={isPending}>
              {t('settings.save')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('rewards.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {referralRewards.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">{t('rewards.empty')}</p>
            ) : (
              referralRewards.map(reward => (
                <div
                  key={reward.id}
                  className="flex flex-col gap-4 rounded-lg border p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="space-y-1">
                    <p className="font-medium">
                      {t('rewards.reward_label', {
                        id: reward.id.slice(0, 8),
                        amount: formatRewardAmount(reward),
                      })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t('rewards.referrer_label', { id: reward.referrerMemberId.slice(0, 8) })} •{' '}
                      {t('rewards.referred_member_label', {
                        id: reward.referredMemberId.slice(0, 8),
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t(`qualifying_event_types.${reward.qualifyingEventType}`)} •{' '}
                      {formatDate(reward.earnedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Select
                      value={reward.status}
                      onValueChange={value =>
                        handleReferralStatusChange(
                          reward.id,
                          value as MemberReferralAdminRewardRow['status']
                        )
                      }
                      disabled={
                        isPending || availableReferralStatusOptions(reward.status).length < 2
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableReferralStatusOptions(reward.status).map(status => (
                          <SelectItem key={status} value={status}>
                            {t(`statuses.${status}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('commissions.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {commissions.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">{t('commissions.empty')}</p>
            ) : (
              commissions.map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-1">
                    <p className="font-medium">{c.agentName}</p>
                    <p className="text-sm text-muted-foreground">
                      {c.memberName || t('commissions.unknown_member')} •{' '}
                      {t(`commission_types.${c.type}`)}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(c.earnedAt)}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-semibold text-lg">{formatAmount(c.amount)}</span>
                    <Select
                      value={c.status}
                      onValueChange={v => handleStatusChange(c.id, v as CommissionStatus)}
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">{t('statuses.pending')}</SelectItem>
                        <SelectItem value="approved">{t('statuses.approved')}</SelectItem>
                        <SelectItem value="paid">{t('statuses.paid')}</SelectItem>
                        <SelectItem value="void">{t('statuses.void')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function toIntlLocale(locale: string) {
  switch (locale) {
    case 'mk':
      return 'mk-MK';
    case 'sq':
      return 'sq-AL';
    case 'sr':
      return 'sr-RS';
    default:
      return 'en-US';
  }
}
