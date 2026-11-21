# TAW.co — readiness before live sales

## Verified current state (2026-11-21)

- Production remains on `main`; do not replace it with this work branch automatically.
- Catalogue and prices remain in `index.html` (13 products).
- `api/create-checkout-session.js` creates a Stripe Checkout Session only when `STRIPE_SECRET_KEY` starts with `sk_test_` and `SITE_URL` is set.
- The Vercel project currently has no project environment variables configured.
- The checkout page is explicitly a test prototype. It does not create a durable order record.
- No Stripe webhook endpoint is present.
- No supplier API/DSers fulfillment integration or shipment tracking is present.
- Existing product cards still use AliExpress affiliate links. Affiliate links do not authorize automatic supplier purchases.

## Safe release gates

1. Confirm the seller's legal status and Stripe account eligibility; do not collect or store card data on TAW.co.
2. Add Stripe test credentials as encrypted Vercel environment variables and test Checkout end-to-end.
3. Implement signed Stripe webhook handling and durable, idempotent order storage before accepting real payments.
4. Confirm a supported supplier integration for this custom Vercel site. The existing DSers connection must be confirmed for this store; do not assume its Wix/Chicall connection applies.
5. Define shipping, returns, refunds, customer support, privacy and legal notices before live sales.
6. Only then configure live Stripe credentials and promote a reviewed deployment to production.

## Required environment variables (names only; never commit values)

- `STRIPE_SECRET_KEY` — Stripe test key first, live key only after all release gates pass.
- `STRIPE_WEBHOOK_SECRET` — signing secret for the webhook endpoint.
- `SITE_URL` — canonical HTTPS site URL.

Do not put secret values in GitHub, source files, screenshots, or chat. Add them only in Vercel Project Settings → Environment Variables.
