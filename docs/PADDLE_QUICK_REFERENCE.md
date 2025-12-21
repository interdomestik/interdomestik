# Paddle Integration - Quick Reference

## 🚀 Status: PRODUCTION READY

---

## Quick Links

- **Setup Guide**: `docs/PADDLE_SETUP.md`
- **Completion Summary**: `docs/PADDLE_INTEGRATION_COMPLETE.md`
- **Roadmap**: `ROADMAP.md` (Phase 1)

---

## Test the Integration

1. Start dev server: `pnpm dev`
2. Navigate to: `http://localhost:3000/sq/pricing`
3. Click "Bëhu Anëtar" on any plan
4. Use test card: `4242 4242 4242 4242`
5. Expiry: `12/28`, CVV: `123`
6. Complete checkout → Success page

---

## Environment Variables (Required)

```bash
NEXT_PUBLIC_PADDLE_ENV=sandbox
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=test_***
PADDLE_API_KEY=pdl_sdbx_apikey_***
PADDLE_WEBHOOK_SECRET_KEY=ntfset_***
NEXT_PUBLIC_PADDLE_PRICE_STANDARD_YEAR=pri_***
```

---

## Key Files

| File                                                | Purpose           |
| --------------------------------------------------- | ----------------- |
| `apps/web/src/middleware.ts`                        | CSP configuration |
| `apps/web/src/config/paddle.ts`                     | Price ID mappings |
| `apps/web/src/components/pricing/pricing-table.tsx` | Checkout trigger  |
| `apps/web/src/app/api/webhooks/paddle/route.ts`     | Webhook handler   |

---

## Troubleshooting

### Checkout not opening?

- Check browser console for CSP errors
- Verify `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` is set
- Restart dev server after `.env` changes

### "Something went wrong"?

- Verify Price ID exists in Paddle dashboard
- Check Price ID matches your Paddle account
- Ensure Client Token and API Key are from same account

### Webhook 404?

- Use ngrok for local testing: `ngrok http 3000`
- Update webhook URL in Paddle dashboard
- In production, use your domain URL

---

## Production Checklist

- [ ] Set `NEXT_PUBLIC_PADDLE_ENV=production`
- [ ] Update to production credentials
- [ ] Create production Price IDs
- [ ] Configure production webhook URL
- [ ] Test checkout flow
- [ ] Verify webhook delivery

---

## Support

- **Paddle Docs**: https://developer.paddle.com
- **Internal Docs**: `docs/PADDLE_SETUP.md`
- **Issues**: Check server logs and Paddle dashboard

---

**Last Updated**: December 21, 2025
