# ═══════════════════════════════════════════════════════════════════════════════

# 🔒 INTERDOMESTIK ENVIRONMENT MANAGEMENT POLICY

# ═══════════════════════════════════════════════════════════════════════════════

## 📋 Environment File Structure

This project uses a hierarchical environment management system to ensure proper separation between development, staging, and production environments.

### 🗂️ Environment Files

```
.env.example              # Template with documentation (committed)
.env.local                # Local development secrets (gitignored)
.env.development.local     # Shared dev configuration (optional, gitignored)
.env.test.local           # Test environment (gitignored)
.env.production.local      # Production secrets (gitignored - NEVER commit)
```

### 🚨 Security Rules

1. **NEVER commit** any environment file containing real secrets
2. **ALWAYS use** development-specific API keys in local development
3. **ROTATE secrets** every 30-90 days
4. **VALIDATE** environment files before committing changes
5. **NEVER share** production secrets through version control

### ✅ Recommended Safe Workflow (Local)

- Keep all tokens (Sonar, Stripe, etc.) in `.env.local` only (gitignored).
- Auto-load environment variables with `direnv`:
  - Install: `brew install direnv`
  - Add to `~/.zshrc`: `eval "$(direnv hook zsh)"`
  - Reload: `source ~/.zshrc`
  - In repo root: `direnv allow`
  - Note: `.envrc` is intended to contain no secrets.
- Pre-commit secret scanning is enforced via `.husky/pre-commit` → `scripts/secrets-precommit.sh`.
- If a token is pasted into chat/logs, rotate it in the provider dashboard.

### 🔄 Environment Loading Order

Next.js and Node.js load environment files in this order:

1. `.env.development.local` - Shared development configuration
2. `.env.local` - Personal development secrets
3. `.env` - Fallback (should be minimal)

### 📝 Environment Variables by Purpose

#### 🔐 Authentication & Security

```bash
BETTER_AUTH_SECRET=          # Session encryption (32+ chars)
JWT_SECRET=                 # JWT token signing (24+ chars)
SESSION_SECRET=              # Session management (16+ hex chars)
CRON_SECRET=                # Cron job protection (24+ chars)
INTERNAL_ACTIONS_SECRET=     # Internal API protection (32+ chars)
```

#### 🌐 Supabase Configuration

```bash
NEXT_PUBLIC_SUPABASE_URL=         # Database API endpoint
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # Public anonymous key
SUPABASE_SERVICE_ROLE_KEY=         # Admin service key
DATABASE_URL=                     # Direct database connection
```

#### 💳 Payment Processing

```bash
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=  # Frontend Stripe key
STRIPE_SECRET_KEY=                    # Backend Stripe secret
STRIPE_WEBHOOK_SECRET=               # Stripe webhook verification
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=       # Paddle frontend token
PADDLE_API_KEY=                      # Paddle backend key
```

#### 🤖 External Services

```bash
OPENAI_API_KEY=            # OpenAI GPT API
RESEND_API_KEY=            # Email service API
NOVU_API_KEY=            # Notification service
GITHUB_CLIENT_ID=          # GitHub OAuth client
GITHUB_CLIENT_SECRET=       # GitHub OAuth secret
```

## 🛠️ Environment Management Tools

### Generate Secure Environment

```bash
# Create new secure development environment
./scripts/security-setup.sh generate

# Validate current environment
./scripts/security-setup.sh check
```

### Environment Validation Script

The security script automatically validates:

- ✅ Strong secret generation (24+ characters)
- ✅ Proper localhost service binding
- ✅ Gitignore protection for sensitive files
- ✅ No exposed secrets in repository
- ✅ Required environment variables present

## 🔍 Environment Variable Validation

### Required for Local Development

```bash
# Authentication
BETTER_AUTH_SECRET
JWT_SECRET
SESSION_SECRET
CRON_SECRET
INTERNAL_ACTIONS_SECRET

# Database
DATABASE_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# Application
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_APP_NAME
```

### Optional but Recommended

```bash
# External services (development keys)
OPENAI_API_KEY
RESEND_API_KEY
STRIPE_SECRET_KEY
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
```

## 📊 Environment-Specific Guidelines

### 🏠 Local Development

```bash
# Security level: Medium (development secrets)
# Service binding: 127.0.0.1 only
# API keys: Development/test only
# Rate limiting: Enabled but permissive
# SSL: Not required
```

### 🧪 Testing Environment

```bash
# Security level: Low (mock secrets)
# Service binding: Localhost only
# API keys: Test/mock only
# Rate limiting: Disabled for testing
# SSL: Not required
```

### 🚀 Production Environment

```bash
# Security level: Maximum (production secrets)
# Service binding: Secure domains only
# API keys: Production only (with quotas)
# Rate limiting: Strict (5-10 req/min)
# SSL: Required
```

## 🔧 Best Practices

### Secret Management

1. **Use environment-specific keys** (never mix dev/prod)
2. **Generate cryptographically strong secrets** (32+ chars for auth)
3. **Store production secrets** in secure vault (1Password, Doppler)
4. **Monitor API key usage** for unusual activity
5. **Rotate keys regularly** (automated if possible)

### Development Workflow

```bash
# 1. Start with secure environment
./scripts/security-setup.sh generate

# 2. Add your personal API keys
# Edit .env.local with your actual development keys

# 3. Validate setup
./scripts/security-setup.sh check

# 4. Start development
supabase start && pnpm dev
```

### Security Checklist

- [ ] All secrets are 24+ characters
- [ ] No production keys in development environment
- [ ] All services bind to localhost (development)
- [ ] Rate limiting is properly configured
- [ ] CSP policies are enforced
- [ ] Environment files are properly gitignored

## 🚨 Incident Response

### If Environment is Compromised

1. **Immediately rotate all secrets**

   ```bash
   ./scripts/security-setup.sh generate
   ```

2. **Revoke all API keys** from respective service dashboards

3. **Review access logs** for unauthorized usage

4. **Update documentation** with new procedures

5. **Notify team** about security incident

### Prevention Measures

- **Pre-commit hooks** for secrets detection
- **Automated scanning** for leaked credentials
- **Regular audits** of environment variables
- **Team training** on security best practices

## 📚 Additional Resources

### Secret Management Tools

- **1Password**: Enterprise password manager
- **Doppler**: Developer-first secrets management
- **HashiCorp Vault**: Enterprise secrets management
- **AWS Secrets Manager**: Cloud secrets management

### Security Tools

- **Git-secrets**: Prevents committing secrets
- **TruffleHog**: Finds secrets in repositories
- **Gitleaks**: Sensitive data scanner

### Documentation

- **OWASP Secrets Management**: Security best practices
- **Next.js Environment Variables**: Official documentation
- **Supabase Security**: Database security guidelines

---

**Remember**: Environment security is the foundation of application security. Treat environment variables with the same care as production passwords.
