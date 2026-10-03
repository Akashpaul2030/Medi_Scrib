# Going live

Frontend on Vercel, API on Fly.io, vectors in Qdrant Cloud, payments through
Paddle as merchant of record (Stripe does not onboard Bangladeshi merchants).

Everything in the app already works locally with limits and credits enforced.
What is left is credentials and two deploys.

---

## 1. What is needed from you

Nothing here can be created on your behalf — each one requires signing in as
you, and several involve identity or bank details. Create them, then paste the
values where noted. **Never commit any of these; `.env` is git-ignored.**

### A. Google sign-in — required

Google Cloud Console → *APIs & Services* → *Credentials* → *Create credentials*
→ *OAuth client ID* → *Web application*.

Before that, fill in the *OAuth consent screen*: External, app name "ScribeAI",
your support email, scopes `email` and `profile`. While it is in **Testing**
only the test users you list can sign in — hit **Publish** before real users.

Authorised redirect URIs (add all three):

```
http://localhost:3000/api/auth/callback/google
https://<your-vercel-domain>/api/auth/callback/google
https://<your-custom-domain>/api/auth/callback/google   (if you add one)
```

Gives you: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`

### B. Paddle — required for payments

Stripe does not onboard merchants in Bangladesh, so payments go through
**Paddle**, a merchant of record: Paddle is the legal seller, charges the
customer, handles sales tax worldwide, and remits to you.

1. Sign up at paddle.com and complete **domain + business verification**.
   This is a review by a human and can take several days — start it before you
   need it. Describe the product plainly as clinical documentation software;
   health-adjacent products sometimes get extra scrutiny, and an account frozen
   after launch is far worse than a slow approval before it.
2. Work in **Sandbox** first (sandbox.paddle.com — a separate account with
   separate keys and price ids).
3. Paddle > Checkout > Checkout settings > **Default payment link**: set it to
   `http://localhost:3000/checkout` in sandbox, and
   `https://<your-domain>/checkout` in production. Nothing can be sold until
   this is set.

| Value | Where |
|---|---|
| `PADDLE_API_KEY` | Developer tools → Authentication → API keys |
| `PADDLE_CLIENT_TOKEN` | Developer tools → Authentication → Client-side tokens |
| `PADDLE_WEBHOOK_SECRET` | Developer tools → Notifications → new destination (starts `pdl_ntfset_`) |
| `PADDLE_ENV` | `sandbox` or `production` |

Webhook destination URL: `https://<your-fly-app>.fly.dev/billing/webhook`
Events to subscribe: `transaction.completed`, `subscription.activated`,
`subscription.updated`, `subscription.canceled`, `subscription.paused`,
`subscription.resumed`.

Then create the catalogue and get the price ids:

```bash
python scripts/paddle_setup.py
```

Paddle has no inline prices — checkout returns 503 until every
`PADDLE_PRICE_*` value is in the environment.

**Payouts to Bangladesh**: Paddle pays sellers worldwide except sanctioned
countries. Confirm the payout method during onboarding — Payoneer does not let
Bangladeshi users hold balances, so expect bank transfer. Get this in writing
from their support before you rely on it.

### C. Fly.io — hosts the API

Sign up, install flyctl, then log in yourself (interactive):

```
! fly auth login
```

No key to hand over — flyctl stores its own token.

### D. Vercel — hosts the frontend

Sign up and connect the GitHub repo `Akashpaul2030/Medi_Scrib`, or log in with
`! vercel login`. Set the root directory to `web/`.

### E. Keys you already have

`DEEPSEEK_API_KEY`, `ASSEMBLYAI_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`.
These just get copied into the Fly secrets.

Two things to check before launch:

* **Fund the DeepSeek and AssemblyAI accounts.** If either balance hits zero,
  structuring or dictation fails for every paying user at once.
* **Your Qdrant cluster is on the free tier.** The previous one was deleted
  after inactivity and took the data with it. Before real customers, move to a
  paid cluster or accept that risk knowingly.

### F. Generated for you — no action needed

`API_JWT_SECRET` was generated and written to both `.env` and
`web/.env.local`. The same value must be set in Fly *and* Vercel — the two
halves of the app use it to sign and verify API tokens.

---

## 2. Deploy the API

```bash
fly launch --no-deploy --name scribeai-api
fly volumes create scribeai_data --size 3 --region lhr

fly secrets set \
  DEEPSEEK_API_KEY=... \
  ASSEMBLYAI_API_KEY=... \
  QDRANT_URL=... \
  QDRANT_API_KEY=... \
  API_JWT_SECRET=<same value as web/.env.local> \
  PADDLE_ENV=production \
  PADDLE_API_KEY=... \
  PADDLE_CLIENT_TOKEN=... \
  PADDLE_WEBHOOK_SECRET=... \
  PADDLE_PRICE_FOUNDING=... \
  PADDLE_PRICE_SOLO=... \
  PADDLE_PRICE_PACK_25=... \
  PADDLE_PRICE_PACK_100=... \
  FRONTEND_URL=https://<your-vercel-domain> \
  CORS_ORIGINS=https://<your-vercel-domain>

fly deploy
```

The first deploy is slow — the image carries torch and docling. Check it came
up with `fly logs` and `curl https://scribeai-api.fly.dev/health`.

## 3. Deploy the frontend

In Vercel → Project → Settings → Environment Variables:

```
AUTH_SECRET=<generate: openssl rand -base64 32>
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
API_JWT_SECRET=<same value as the Fly secret>
NEXT_PUBLIC_API_URL=https://scribeai-api.fly.dev
NEXTAUTH_URL=https://<your-vercel-domain>
```

Do **not** set `ALLOW_DEV_LOGIN` or `NEXT_PUBLIC_ALLOW_DEV_LOGIN` in
production. The code refuses to enable the password-less dev login in a
production build anyway, but leave them out.

`ALLOWED_EMAILS` is optional: set it to a comma-separated list to run a closed
beta where only invited addresses can sign in. Leave it empty to let anyone
with a Google account in.

## 4. After the first deploy

1. Point the Paddle webhook destination at the real Fly URL and paste the
   signing secret back in with `fly secrets set PADDLE_WEBHOOK_SECRET=…`.
2. Update the Paddle default payment link to `https://<your-domain>/checkout`.
3. Run a sandbox purchase end to end with Paddle's test card `4242 4242 4242 4242`:
   free limit → paywall → buy credits → webhook fires → credits appear → note
   structures. Watch `fly logs` while you do it.
4. Repeat everything in the production Paddle account: new API key, new client
   token, new webhook secret, and **new price ids** from a second run of
   `scripts/paddle_setup.py`.

---

## How the limits work

| | Free | Subscribed |
|---|---|---|
| Notes included per month | `FREE_MONTHLY_NOTES` (10) | `PAID_MONTHLY_NOTES` (150) |
| Past the allowance | buy credits | buy credits |

* One structured note is one billable unit. Reading, searching, asking
  questions and comparing notes are all free.
* Credits are only spent after the monthly allowance is gone, and never expire.
* Both numbers are env vars, changeable without a code change.
* If the model call fails, the unit is refunded automatically.
* Transcription is blocked when out of quota, so the AssemblyAI bill cannot be
  run up by an account that cannot structure the result anyway.

## Security notes

* The API authenticates every request with a signed token; there is no header
  fallback, so a misconfigured deploy fails closed rather than exposing data.
* Tokens live 15 minutes and are minted server-side at `/api/token`. The
  browser never sees `API_JWT_SECRET`.
* `/structure`, `/ingest`, `/transcribe`, `/export/pdf` and every note endpoint
  require a valid token. Only `/health` and `/billing/config` are public.
* Webhook signatures are verified with HMAC-SHA256 over the raw body, and
  signatures older than 5 minutes are rejected as replays.
* Credit amounts are derived from the Paddle **price id** on the paid
  transaction, never from data the browser supplied — a tampered checkout
  cannot mint credits.
* Both the event id and the transaction id are recorded, so a Paddle retry
  cannot grant credits twice.
* Fulfilment happens only in the webhook. The browser returning from checkout
  just polls `/usage`; it can never grant anything itself.

## Still outstanding before charging money

* **No BAA is in place** with DeepSeek or AssemblyAI, so this is not a
  HIPAA-compliant service. The login screen says de-identified notes only —
  keep that language visible at the point of payment until that changes.
* `/ask` retrieves across all of a user's notes with no per-patient filter, so
  an answer can blend two patients. Worth fixing before clinicians rely on it.
