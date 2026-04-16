# AutoWallet

Next.js (App Router) + TypeScript app that logs expenses from **bank-style emails** and **receipt images**, using the **Google Gemini API** for extraction, with a **dashboard** for totals, category percentages, and time filters. Deploys cleanly on **Vercel** with **PostgreSQL** (Prisma).

## Features

- **Sign in:** Email/password (seeded demo user) and optional **Google OAuth** when `GOOGLE_CLIENT_*` is set.
- **Receipt upload:** Multipart upload → Gemini vision → stored `Transaction` (optional **Vercel Blob** when `BLOB_READ_WRITE_TOKEN` is set).
- **Paste email text:** Authenticated users can paste notification text for quick tests (`/api/ingest/paste`).
- **Inbound email webhook:** `POST /api/webhooks/email` with `x-ingest-secret` (see below).
- **Gmail sync (optional):** `GET /api/cron/gmail-sync` with `Authorization: Bearer CRON_SECRET` — processes recent messages when `GMAIL_REFRESH_TOKEN` and OAuth client env are configured. **Vercel Cron** is defined in [`vercel.json`](vercel.json).
- **Deduping:** Email path uses `externalId` (`message-id` or content hash). Low-confidence rows get `needsReview`.

---

## For developers

### Prerequisites

- Node.js 20+
- PostgreSQL (local Docker, [Neon](https://neon.tech), [Supabase](https://supabase.com), etc.)
- [Gemini API key](https://aistudio.google.com/) (`GEMINI_API_KEY`)

### Setup

```bash
git clone https://github.com/<your-username>/AutoWallet.git
cd AutoWallet
cp .env.example .env
# Edit .env — set DATABASE_URL, AUTH_SECRET, GEMINI_API_KEY, NEXTAUTH_URL
npm install
npx prisma migrate deploy   # or: npx prisma migrate dev --name init
npx prisma db seed
npm run dev
```

If you already cloned this repo under the old folder name, you can rename it locally:

```bash
mv FinanceTracker AutoWallet
cd AutoWallet
```

Open [http://localhost:3000](http://localhost:3000). After seed, sign in with:

- **Email:** `demo@example.com`
- **Password:** `demo12345`

### Environment variables

See [`.env.example`](.env.example). Important:

| Variable | Purpose |
| -------- | ------- |
| `DATABASE_URL` | Postgres connection string for Prisma |
| `AUTH_SECRET` | Random secret (`openssl rand -base64 32`) — required by Auth.js |
| `NEXTAUTH_URL` | Public URL (`http://localhost:3000` locally, `https://…` on Vercel) |
| `GEMINI_API_KEY` | Gemini (server only) |
| `EMAIL_INGEST_SECRET` | Shared secret for `/api/webhooks/email` |
| `INGEST_USER_EMAIL` | Which user receives webhook-created transactions (must exist in DB) |
| `BLOB_READ_WRITE_TOKEN` | Optional — persist receipt images to Vercel Blob |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional — Google sign-in |
| `GMAIL_REFRESH_TOKEN` | Optional — Gmail API for cron sync |
| `CRON_SECRET` | Bearer token for `/api/cron/gmail-sync` |

### Email webhook (forward-to-ingest)

Send JSON to your deployed app:

```bash
curl -X POST "https://YOUR_DOMAIN/api/webhooks/email" \
  -H "Content-Type: application/json" \
  -H "x-ingest-secret: YOUR_EMAIL_INGEST_SECRET" \
  -d '{"subject":"Card purchase","text":"You spent $12.50 at COFFEE SHOP","messageId":"<unique-id@mail.gmail.com>"}'
```

`messageId` enables deduplication. Omit it to dedupe by a hash of subject+text (weaker).

### Privacy & data

- Do not log full card numbers in prompts; snippets are truncated in the database.
- Gemini calls run **server-side** only; the API key never ships to the browser.

### Production / Vercel

1. Set all env vars in the Vercel project.
2. Run `npx prisma migrate deploy` against production (locally with prod `DATABASE_URL` or in CI).
3. `npm run build` runs `prisma generate` automatically.

---

## For users

1. **Sign in** (Google or demo credentials your developer provides).
2. **Dashboard:** Pick a time range (7 / 30 / 90 / 365 days), see **total spend**, **category pie chart**, and **transactions**.
3. **Upload a receipt** image for cash or offline purchases.
4. **Paste bank email** text to import a notification without a webhook.
5. If your developer configured **email forwarding**, forwarded messages can hit the webhook and appear automatically.

---

## License

Set by the project owner.
