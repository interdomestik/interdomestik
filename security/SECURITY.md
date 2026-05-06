# 🔒 Development Security Checklist

This checklist ensures secure development practices for the Interdomestik project.

## ✅ Critical Security Settings (Always Complete)

### 🔐 Authentication & Secrets

- [x] **Strong secrets generated**: All secrets are cryptographically secure (32+ chars)
- [ ] **Development-only API keys**: Never use production API keys locally
- [ ] **Auth secret rotation**: Change BETTER_AUTH_SECRET every 30-90 days
- [x] **Cron protection**: CRON_SECRET set and no dev bypass flags are used
- [x] **Session security**: JWT_SECRET and SESSION_SECRET are unique and strong
- [x] **Webhook integrity**: Paddle signature bypass is disabled except in tests

### 🌐 Network Security

- [x] **Localhost binding**: All Supabase services bind to 127.0.0.1 only
- [ ] **Database security**: Database uses strong password and SSL enabled
- [ ] **Service isolation**: No development services exposed to external networks
- [ ] **Firewall rules**: Development ports 54321-54326 accessible from localhost only
- [ ] **CSP nonce migration**: Follow the approved design in
      [docs/security/csp-nonce-migration.md](../docs/security/csp-nonce-migration.md)

### 🚀 Environment Management

- [x] **Environment separation**: .env.local contains only personal development secrets
- [x] **GitIgnore protection**: Secret env files (.env.local, .env.\*.local, .env.production) are ignored
- [x] **Secret generation**: Use `openssl rand -base64 32` for new secrets
- [ ] **API key limits**: All development API keys have usage quotas
- [x] **Shared env files**: .env.development and .env.test contain non-secret defaults

## 🛡️ Security Hardening Tasks

### Priority 1 (Immediate - Do Today)

1. **Generate all development API keys**

   ```bash
   # Replace placeholder keys in .env.local with your actual dev keys
   # OpenAI: https://platform.openai.com/api-keys
   # Stripe: https://dashboard.stripe.com/test/apikeys
   # Resend: https://resend.com/api-keys
   # Paddle: https://vendors.paddle.com/
   ```

2. **Test authentication flows**

   ```bash
   pnpm dev
   # Test: Login, register, password reset, OAuth
   ```

3. **Verify service binding**

   ```bash
   netstat -an | grep 5432
   # Should show 127.0.0.1:54321-54326 only
   ```

4. **Confirm no bypass flags**
   ```bash
   rg -n "CRON_BYPASS_SECRET_IN_DEV|PADDLE_WEBHOOK_BYPASS_SIGNATURE_IN_DEV" .env.development .env.local
   # Should be absent or set to false outside tests
   ```

### Priority 2 (Week 1)

1. **Database security hardening**
   - Change default postgres password
   - Enable SSL for local database
   - Set up database connection pooling

2. **API key management**
   - Set up usage alerts on all development API keys
   - Create separate keys for different environments
   - Document API key rotation procedures

3. **Security monitoring**
   - Add structured logging for authentication events
   - Set up local security alerts
   - Monitor unusual API usage patterns

### Priority 3 (Month 1)

1. **Automated security scanning**
   - Add pre-commit hooks for secrets detection
   - Set up dependency vulnerability scanning
   - Implement automated security tests

2. **Infrastructure security**
   - Consider Docker Compose for service isolation
   - Set up network segmentation
   - Implement proper backup procedures

## 🚨 Security Violation Response

### If Production Keys Are Exposed

1. **Immediate action**

   ```bash
   # Revoke all exposed keys immediately
   # Rotate all secrets and passwords
   # Review recent access logs
   ```

2. **Service recovery**
   - Generate new API keys from respective dashboards
   - Update all environment files
   - Test all functionality with new keys

3. **Prevention**
   - Add secrets scanning to CI/CD pipeline
   - Implement stricter .gitignore rules
   - Conduct security training

### If Services Are Exposed Externally

1. **Immediate isolation**

   ```bash
   # Stop all services
   pkill -f supabase
   # Check binding configuration
   # Restart with localhost binding only
   ```

2. **Security audit**
   - Review network access logs
   - Check for unauthorized access attempts
   - Audit all authentication events

## 📋 Development Security Commands

### Generate New Secrets

```bash
# Strong secrets (32+ characters)
openssl rand -base64 32  # Auth secrets
openssl rand -base64 24  # Shorter secrets
openssl rand -hex 16     # Hex secrets

# Check service binding
netstat -an | grep 5432
lsof -i :54321-54326
```

### Security Validation

```bash
# Test authentication
pnpm test:e2e:chromium -- --grep "auth"

# Check for secrets in git
git grep --cached -i "sk_" -- . ':(exclude)*.example'

# Scan dependencies
pnpm audit

# Validate dev API keys are non-production
./scripts/api-keys.sh validate-dev .env.local
```

### Service Management

```bash
# Start services securely
supabase start  # Uses config.toml settings
pnpm dev         # Start application

# Stop all services
supabase stop
pkill -f "next dev"
```

## 🔧 Configuration Files

### Files to Monitor for Security

- `.env.local` - Contains all development secrets
- `.env.development` - Shared development settings (no secrets)
- `.env.test` - Test-only settings (may include bypass flags)
- `supabase/config.toml` - Service binding and configuration
- `apps/web/src/app/api/cron/_auth.ts` - Authentication logic
- `packages/domain-membership-billing/src/paddle-webhooks/verify.ts` - Webhook verification
- `packages/database/src/db.ts` - Connection pooling and client setup
- `.gitignore` - Protects sensitive files from commits

### Security-Safe Development Practices

1. **Never commit** real API keys or secrets
2. **Use development credentials** for all external services
3. **Bind services** to localhost only in development
4. **Rotate secrets** regularly (every 30-90 days)
5. **Monitor usage** of all API keys and services
6. **Test authentication** thoroughly after any changes

## 📞 Security Contacts

If you discover a security vulnerability:

1. **Don't create public GitHub issues**
2. **Report immediately** to project maintainers
3. **Include details** about the potential impact
4. **Follow responsible disclosure** practices

## 🔄 Daily Security Checklist

Before starting development each day:

- [x] `.env.local` exists and is gitignored
- [x] All services bind to 127.0.0.1 only
- [ ] API key usage is within normal limits
- [x] No authentication bypasses are active
- [x] Paddle webhook signature bypass is disabled (except tests)
- [ ] Recent commits have no exposed secrets

---

## 🏗️ Structured Security Framework Integration

### Security Logging System

```bash
# Use the new structured logging system
import { createLogger } from '@interdomestik/shared-logging';

const logger = createLogger();

// Log security events
logger.logSecurity({
  timestamp: new Date().toISOString(),
  level: 'critical',
  event: 'unauthorized_access_attempt',
  source: 'api',
  userId: req.user?.id,
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  metadata: { path: req.path, method: req.method }
});
```

### Real-time Security Monitoring

```bash
# Start security monitoring
./scripts/security-tests.sh run

# Monitor API key usage
./scripts/api-keys.sh monitor

# Database health monitoring
./scripts/database-security.sh test
```

### Automated Security Scanning

```bash
# Complete security scan
./scripts/security-scan.sh all

# Generate security report
./scripts/security-scan.sh report

# CI/CD Integration (add to package.json)
{
  "scripts": {
    "security-scan": "./scripts/security-scan.sh all",
    "security-test": "./scripts/security-tests.sh run",
    "pre-commit": "./scripts/security-scan.sh secrets && npm run lint"
  }
}
```

## 📋 Compliance Frameworks

### SOC 2 Type II Compliance

```
Access Control
✅ User authentication and authorization
✅ Role-based access control (RBAC)
✅ Session management with timeout
✅ Multi-factor authentication available

Audit Trails
✅ Comprehensive logging of all security events
✅ Audit log retention for 1 year
✅ Tamper-evident audit trails
✅ Regular audit log reviews

Data Protection
✅ Encryption of sensitive data at rest
✅ Encryption of data in transit (TLS)
✅ Secure key management practices
✅ Data backup and recovery procedures

Incident Response
✅ Security incident response plan
✅ 24/7 security monitoring
✅ Automated threat detection
✅ Regular security testing
```

### ISO 27001 Information Security

```
A.9 Access Control
✅ Identity management
✅ Authentication controls
✅ Authorization controls
✅ Security awareness training

A.12 Operations Security
✅ Change management procedures
✅ Vulnerability management
✅ Incident management procedures
✅ Backup and recovery

A.14 System Acquisition
✅ Security requirements in contracts
✅ Secure development lifecycle
✅ Security testing and evaluation
✅ Supply chain security
```

### GDPR Compliance

```
Data Protection by Design
✅ Privacy impact assessments
✅ Data minimization principles
✅ Consent management systems
✅ Right to deletion implementation

Data Subject Rights
✅ Data export functionality
✅ Data correction procedures
✅ Identity verification for requests
✅ Response timeframes (30 days)

Security Measures
✅ Encryption of personal data
✅ Access control and auditing
✅ Data breach notification procedures
✅ Regular security assessments
```

## 🚨 Advanced Incident Response

### Security Incident Classification

```
Level 1 - Low
Description: Single user account compromise, no data loss
Response Time: 24 hours
Actions: Reset passwords, monitor activity, document

Level 2 - Medium
Description: Multiple accounts, limited data exposure
Response Time: 12 hours
Actions: Force password resets, analyze logs, notify stakeholders

Level 3 - High
Description: System breach, significant data exposure
Response Time: 4 hours
Actions: System lockdown, forensic analysis, legal notification, public disclosure

Level 4 - Critical
Description: Active attacker, widespread data theft
Response Time: 1 hour
Actions: Immediate system shutdown, emergency response, full investigation
```

### Incident Response Team (SIRT) Structure

```
Incident Commander - Security team lead
Technical Lead - Development lead
Communications Lead - PR/management
Legal Counsel - Compliance officer
Forensics Lead - Security analyst
```

## 🛠️ Third-Party Security Tools Integration

### Security Monitoring Tools

```bash
# Sentry (Error & Security Monitoring)
NEXT_PUBLIC_SENTRY_DSN=https://your-dsn@sentry.io/project
SENTRY_ENVIRONMENT=production

# Integration
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});

// Security event capture
Sentry.captureEvent({
  message: 'Security incident detected',
  level: 'fatal',
  extra: {
    event: 'unauthorized_access',
    userId: currentUser.id,
    ip: request.ip
  }
});
```

### Dependency Security

```bash
# Snyk for vulnerability scanning
npx snyk test

# OWASP dependency check
npm audit --audit-level moderate

# GitHub security scanning
gh secret-scanning scan
```

### Infrastructure Security

```bash
# Infrastructure as Code (IaC) Security
# Terraform security scanning
terraform plan -out=plan.tfplan
tfsec .

# Kubernetes security
kubectl get pods -o yaml | kube-score score -

# Container security
docker scan interdomestik/web:latest
trivy image interdomestik/web:latest
```

## 🧬 Advanced Threat Detection

### Anomaly Detection Patterns

```typescript
// Behavioral analysis for security events
interface SecurityPattern {
  threshold: number;
  windowMs: number;
  alertLevel: 'warn' | 'error' | 'critical';
  description: string;
}

const securityPatterns: SecurityPattern[] = [
  {
    threshold: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    alertLevel: 'error',
    description: 'Multiple failed login attempts from same IP',
  },
  {
    threshold: 100,
    windowMs: 60 * 60 * 1000, // 1 hour
    alertLevel: 'warn',
    description: 'High API usage rate for single user',
  },
  {
    threshold: 10,
    windowMs: 5 * 60 * 1000, // 5 minutes
    alertLevel: 'critical',
    description: 'Multiple failed admin access attempts',
  },
];
```

### ML-Based Security Monitoring

```typescript
// Integration with security monitoring services
interface SecurityMonitoring {
  detectAnomalies(events: SecurityEvent[]): Promise<ThreatAlert[]>;
  classifyThreat(event: SecurityEvent): Promise<ThreatLevel>;
  generateSecurityReport(timeRange: TimeRange): Promise<SecurityReport>;
}

// Example integration with external service
const securityMonitor: SecurityMonitoring = {
  // Connect to Datadog, Splunk, or similar
  detectAnomalies: async events => await detectSuspiciousPatterns(events),
  classifyThreat: async event => await analyzeThreatLevel(event),
  generateSecurityReport: async range => await compileSecurityMetrics(range),
};
```

## 🔄 Continuous Security Automation

### CI/CD Pipeline Integration

```yaml
# .github/workflows/security.yml
name: Security Pipeline

on: [push, pull_request]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Security Scan
        run: |
          ./scripts/security-scan.sh all
          ./scripts/security-tests.sh run

      - name: Dependency Audit
        run: |
          npm audit --audit-level high
          npx snyk test

      - name: Container Security
        run: |
          docker build -t interdomestik-test .
          trivy image interdomestik-test
```

### Automated Security Testing

```bash
# Weekly automated security testing
#!/bin/bash
# weekly-security-test.sh

echo "🔍 Running weekly security automation..."

# 1. Complete security scan
./scripts/security-scan.sh all

# 2. API penetration testing
npx zap-baseline.py -t http://localhost:3000

# 3. Database security audit
./scripts/database-security.sh audit

# 4. Performance security impact
./scripts/security-tests.sh run

# 5. Generate compliance report
./scripts/compliance-check.sh generate

echo "✅ Weekly security automation completed"
```

---

## 📚 Additional Security Resources

### Security Documentation Standards

- **OWASP Top 10**: https://owasp.org/www-project-top-ten/
- **CWE Catalog**: https://cwe.mitre.org/
- **NIST Cybersecurity Framework**: https://www.nist.gov/cyberframework/
- **ISO 27001**: https://www.iso.org/isoiec-27001-information-security.html

### Security Testing Tools

- **OWASP ZAP**: Web application security testing
- **Burp Suite**: Web vulnerability scanning
- **SQLMap**: SQL injection testing
- **Nmap**: Network security scanning
- **Metasploit**: Penetration testing framework

### Compliance Automation

- **OpenSCAP**: Security content automation protocol
- **Chef InSpec**: Compliance as code
- **Terraform Security**: Infrastructure security testing
- **Aqua Security**: Container and supply chain security

---

**Remember**: Security is a continuous process, not a destination. This document evolves with the security landscape. Regular updates and reviews are essential for maintaining effective security posture.
