## Canonical 5 Commands (Fail-Fast)

```bash
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
export BETTER_AUTH_SECRET="local-e2e-secret-32chars-min"
```

```bash
node -e "const v=process.versions.node.split('.').map(Number); if(v[0]!==20){console.error('Node 20.x required, found '+process.versions.node); process.exit(1)}; console.log('Node OK:', process.versions.node)"
```

```bash
pnpm pr:verify
```

```bash
pnpm security:guard
```

```bash
bash scripts/m4-gatekeeper.sh && pnpm e2e:gate
```

## Notes

- Step 5 runs gatekeeper and E2E gate as a single fail-fast command.
- Treat these five commands as the canonical pilot readiness sign-off.
