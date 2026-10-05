import { describe, expect, it } from 'vitest';
import { NodeClient, defaultStackParser, type Event } from '@sentry/nextjs';
import {
  ENTERPRISE_ALERT_CONTRACT,
  resolveEnterpriseAuthAlertTags,
} from '../auth-enterprise-alert-tags';
import { normalizeAuthTelemetryPayload } from '../auth-telemetry';
import { scrubSentryEvent } from './sentry-privacy';

const protectedTags = {
  enterprise_alert: 'protected_route',
  alert_contract: ENTERPRISE_ALERT_CONTRACT,
  route_contract: 'canonical_protected_route',
  protected_route_class: 'member',
};

describe('existing enterprise alert transport compatibility', () => {
  it.each([
    ['protected_route_bounce_to_login', 'member', 'missing_cookie'],
    ['protected_route_bounce_to_login', 'unknown', 'missing_cookie'],
    ['session_introspection_throttled', 'unknown', 'throttled'],
    ['staff_post_login_redirect_failed', 'staff', 'post_login_sync_timeout'],
  ] as const)(
    'retains %s source metadata through actual SDK transport without private fields',
    async (eventName, surface, reason) => {
      const tags = resolveEnterpriseAuthAlertTags(
        normalizeAuthTelemetryPayload({
          eventName,
          surface,
          reason,
          tenant: 'private-tenant-marker',
          pathname: '/en/member/claims/private-owner-marker',
        })
      );
      expect(tags).not.toBeNull();
      if (!tags) throw Error('source contract missing');
      const envelopes: unknown[] = [];
      const events: Event[] = [];
      const client = new NodeClient({
        dsn: 'https://testkey@sentry.example/123',
        integrations: [],
        stackParser: defaultStackParser,
        beforeSend: scrubSentryEvent,
        transport: () => ({
          send: envelope => {
            envelopes.push(envelope);
            for (const item of envelope[1])
              if (item[0].type === 'event') events.push(item[1] as Event);
            return Promise.resolve({ statusCode: 200 });
          },
          flush: () => Promise.resolve(true),
        }),
      });
      client.init();
      client.captureEvent({
        message: `enterprise_alert.${tags.enterprise_alert}`,
        level: 'warning',
        tags: { ...tags, private_note: 'private-tenant-marker' },
        fingerprint: ['private-owner-marker'],
        user: { email: 'private-email-marker@example.test' },
        extra: { raw: 'private-extra-marker' },
        request: {
          url: 'https://example.test/en/member/claims/private-owner-marker?secret=private-query-marker',
        },
      });
      expect(await client.flush(500)).toBe(true);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        message: `enterprise_alert.${tags.enterprise_alert}`,
        tags,
        fingerprint: [
          'enterprise-alert',
          tags.enterprise_alert,
          tags.protected_route_class ?? 'route_class_none',
        ],
      });
      expect(events[0].tags).toEqual(tags);
      expect(JSON.stringify(envelopes)).not.toContain('private-');
      await client.close(500);
    }
  );

  it.each([
    { message: 'enterprise_alert.auth_session', tags: protectedTags },
    {
      message: 'enterprise_alert.protected_route',
      tags: { ...protectedTags, alert_contract: 'private-contract-marker' },
    },
    {
      message: 'enterprise_alert.protected_route',
      tags: { enterprise_alert: 'protected_route', route_contract: 'canonical_protected_route' },
    },
    {
      message: 'enterprise_alert.protected_route',
      tags: { enterprise_alert: 'protected_route', alert_contract: ENTERPRISE_ALERT_CONTRACT },
    },
    {
      message: 'enterprise_alert.protected_route',
      tags: { ...protectedTags, route_contract: 'private-route-marker' },
    },
    {
      message: 'enterprise_alert.tenant_boundary',
      tags: { enterprise_alert: 'tenant_boundary', alert_contract: ENTERPRISE_ALERT_CONTRACT },
    },
    {
      message: 'enterprise_alert.tenant_rls',
      tags: { enterprise_alert: 'tenant_rls', alert_contract: ENTERPRISE_ALERT_CONTRACT },
    },
  ])('rejects incoherent or unimplemented contract metadata', event => {
    const sent = scrubSentryEvent({ ...event, fingerprint: ['private-fingerprint-marker'] });
    expect(sent?.message).toBeUndefined();
    expect(sent?.tags).toEqual({});
    expect(sent).not.toHaveProperty('fingerprint');
    expect(JSON.stringify(sent)).not.toContain('private-');
  });

  it('drops an arbitrary route class and rebuilds the source unknown-surface fingerprint', () => {
    const sent = scrubSentryEvent({
      message: 'enterprise_alert.protected_route',
      tags: { ...protectedTags, protected_route_class: 'private-member-marker' },
      fingerprint: ['private-fingerprint-marker'],
    });
    expect(sent?.tags).toEqual({
      enterprise_alert: 'protected_route',
      alert_contract: ENTERPRISE_ALERT_CONTRACT,
      route_contract: 'canonical_protected_route',
    });
    expect(sent?.fingerprint).toEqual(['enterprise-alert', 'protected_route', 'route_class_none']);
    expect(JSON.stringify(sent)).not.toContain('private-');
  });
});
