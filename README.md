# Earnly

[![Bounties](https://img.shields.io/badge/bounties-%242%2C280-open%20for%20contributors-brightgreen)](https://github.com/Earnly-Build/earnly/issues)

**Verified student opportunity and earning platform.** Students confirm they are
students, find paid tasks, jobs and internships, get paid in USDC, collect
ratings from the people who paid them, and graduate with a record of real work
instead of an empty CV.

The core loop the product is built around:

> **Verify → Discover → Apply → Work → Get paid → Build reputation → Gain experience**

This is a hackathon/grant prototype. Everything below marked *demo* is
deliberately mocked and the interface says so on screen.

## Running it

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # production build (webpack)
npm run lint
npm run test      # unit + component suite (offline)
npx tsc --noEmit  # type check
npm run db:migrate  # applies db/migrations/*.sql to DATABASE_URL

# end-to-end against the real networks (needs `npm run dev` in another shell)
npm run wallet:live-check
```

Node 20.9+ (Next.js 16 requirement). Fonts are self-hosted in `public/fonts`,
so the build does not need network access.

### Prototype storage versions

The `earnly:v3` localStorage key now stores `{ v: 1, data: {...} }`; the key name
is independent of the payload schema version. Loading uses the pure helpers in
`src/lib/persistence.ts`. The original flat payload is legacy v0: known fields
are copied over the demo defaults, validated, and written as v1 on the next
save. An explicit `{ v: 0, data: { theme: "dark" } }`, for example, migrates to
v1 with a dark theme and defaults for missing legacy fields. Both paths are tested.

Invalid JSON, malformed state, and unsupported versions fall back to the full
initial state. Future versions are never partially applied. Obsolete root fields
are not retained. Add an explicit migration and tests when changing the schema;
do not silently reinterpret a newer payload. Storage access can still fail in
private mode, and readiness still waits for session refresh before route guards run.

### Environment variables

Copy the shape below into `.env.local` for development, and set the same keys
in **Vercel → Project → Settings → Environment Variables** for production.
`.env.local` is gitignored; no secret is ever committed.

```
GOOGLE_CLIENT_ID=        # Google OAuth client id (server-side)
GOOGLE_CLIENT_SECRET=    # Google OAuth client secret — server-side only
DATABASE_URL=            # Neon Postgres connection string
DATABASE_URL_POOLED=     # Neon pooler connection string (used at runtime)
AUTH_SECRET=             # 32+ random bytes, signs the session cookie
APP_URL=                 # public origin, e.g. https://earnly-app.vercel.app
WALLET_MASTER_KEY=       # 32 bytes base64 — seals wallet keys at rest (openssl rand -base64 32)
SEPOLIA_RPC_URL=         # Sepolia JSON-RPC endpoint (optional; a public default is used)
```

`.env.example` documents every variable. `WALLET_MASTER_KEY` is required for the
wallet to work at all: without it the wallet API answers `503` with an explicit
message rather than inventing an address.

`GOOGLE_CLIENT_SECRET`, `DATABASE_URL` and `AUTH_SECRET` are only read inside
server modules (`src/lib/auth.ts`, `src/lib/db.ts`, `src/lib/session.ts`) and
never reach the browser. `APP_URL` decides the OAuth callback: the redirect
sent to Google is `APP_URL + /api/auth/google/callback`, so that exact URL must
be registered as an authorised redirect URI on the Google OAuth client (add
`http://localhost:3000/api/auth/google/callback` too, for local work).

## Design

The visual system was produced with the **App Designer** skill in the
terminal, not chosen up front. Three directions for the dashboard were
rendered and compared (`design/app-designer/directions.html`, renders in
`design/app-designer/out/`), and the winner is written down in
`design/DIRECTION.md`:

> **Earnly is a campus night market.** Stalls open after the last lecture;
> every stall is a piece of paid work, every price tag is real.

- **Signature shape:** the tag — a rectangle with one squared corner.
- **Depth:** a hard offset shadow, never a soft one and never a glow.
- **Accent:** one lamp-amber, used only for the primary action and "now".
- **Type:** Archivo (variable width) for everything; Geist Mono for every
  number. Seven type sizes, nothing below 11px.
- **Two themes, both designed:** night ink (default) and chalk paper (light),
  not an inversion. Switch with the sidebar toggle.

The landing hero is a real campus photograph, art-directed with a duotone
treatment and overlapping product panels rather than a screenshot in a frame.

## What is real and what is mocked

| Area | Status |
|---|---|
| Landing page | Built |
| Auth (Google + email) | **Real** — Google OAuth 2.0 with PKCE, email sign-up/sign-in with scrypt-hashed passwords, signed HttpOnly session cookie, duplicate accounts prevented by provider id then email |
| Database | **Real** — Neon Postgres (`users`, `auth_accounts`, `profiles`, `user_skills`, `custom_universities`, `sessions`) |
| University data | **Real** — 244 seeded universities across seven regions, searchable, plus student-added universities persisted to Postgres |
| Skills data | **Real** — 9 categories, ~190 skills, custom skills, case-insensitive duplicate prevention, persisted per user |
| Onboarding | Built and persisted; progress resumes where the student stopped |
| Student verification | Built UI, all four states; the *approval step* is still simulated (no verification provider) |
| Dashboard, Tasks, Jobs, Internships | Built on demo listings |
| Search, filters, sorting, saved | Built, in-memory + `localStorage` |
| Apply → Paid pipeline | Built; stage changes are demo buttons |
| Profile, ratings, reviews | Built on demo data |
| Payments — Stellar Testnet wallet | **Real** — Testnet wallet per account, live Horizon balances, XLM send/receive, Friendbot funding, reconciled history |
| Payments — Sepolia wallet | **Real** — embedded Sepolia wallet, live balance from chain, native test ETH send/receive |
| Payments — Swap | Placeholder, labelled **COMING SOON**; no bridge, aggregator, quote or transaction |
| Payments (USDC balances, earning ledger) | Built on demo money — **no chain transaction exists** for those figures |
| AI Opportunity Finder | Built wizard, ranked and explained results; **no live web search ran** |
| Asset Leasing, Inventory Loans, Digital Pawn Shop | Product pages with real explanatory flows; no listing, loan, valuation or pledge is processed — labelled **COMING SOON** |
| Marketplace, Scholarships, Social, Off-ramp | Visually complete, labelled **COMING SOON** |
| Testimonials, FAQ, footer, About/Privacy/Terms/Contact pages | Built; testimonials are product previews, not results from this prototype |

Demo money references are prefixed `demo-ref-` on purpose. Nothing in this
repository signs or broadcasts anything for the USDC earning ledger. The
Payments → Stellar and Payments → Ethereum wallets *do* sign and broadcast real
Testnet transactions; see `docs/wallet-integration.md`.

## Wallet integration

`Payments` holds three destinations: **Stellar** (Testnet, primary), **Ethereum**
(Sepolia) and **Swap** (a labelled placeholder). Both wallets are created
automatically after Google sign-in — no external wallet, no seed phrase — and the
addresses stay stable across refresh, logout and redeploy.

`docs/wallet-integration.md` is the full guide: custody model and its limits,
the exact managed-provider blocker, how Stellar and Sepolia transactions are
signed and confirmed, the schema, the API surface, every environment variable,
what the test suites cover and what is still outstanding.

## API error contract

Every route under `/api/**` returns one error shape via
`errorResponse(code, message, status, retryable)` from `src/lib/api.ts`:

```json
{ "ok": false, "code": "unauthorized", "error": "Sign in to use your wallet.", "retryable": false }
```

`error` stays human-readable (existing clients keep working), `code` is
machine-stable for programmatic handling, and `retryable` tells callers a
retry can succeed. Success responses use `okResponse()` → `{ ok: true, ... }`.

## Architecture

```
src/
  app/                 routes (App Router)
    page.tsx           landing
    signin, verify, onboarding
    api/               auth (google/email/session/signout), profile,
                       universities, health, wallet (index, provision,
                       stellar send/fund, evm send) — all Node runtime
    app/               authenticated shell + dashboard, tasks, jobs,
                       internships, work, payments (hub + stellar + ethereum
                       + swap), profile, ai,
                       leasing, loans, pawn,
                       marketplace, scholarships, social, offramp
    about, privacy, terms, contact
  components/          AppShell, cards, Browse, OpportunityDetail, ComingSoon,
                       UniversityPicker, SkillsPicker, PageShell,
                       landing/ (Products, Testimonials, Faq, SiteFooter),
                       ui.tsx (buttons, tags, badges, modal, icons)
  lib/
    auth.ts            Google OAuth, scrypt email auth, account de-duplication
    db.ts              Neon client (server-only)
    session.ts         signed HttpOnly session cookie
    universities.ts     global university catalogue + search
    skills.ts          categorised skill library, sanitising, de-duplication
  lib/
    types.ts           the data contracts
    data.ts            demo listings, transactions, reviews, notifications
    store.tsx          session, verification, onboarding, applications, theme
    ai.ts              discovery pipeline + SourceAdapter interface
    chain/
      config.ts        every network endpoint, chain id and display label
      crypto.ts        AES-256-GCM envelope encryption for signing secrets
      keys.ts          Stellar and EVM keypair generation
      wallets.ts       wallet store: idempotent provisioning, transaction records
      stellar.ts       Stellar Testnet service (Horizon, fees, payments)
      evm.ts           Sepolia service (viem, balances, transfers)
      decimal.ts       exact decimal→BigInt amount handling
      activity.ts      network history merged with our own records
      api.ts           session guards for the wallet routes
```

`src/lib/ai.ts` is where the real work goes. It defines `SourceAdapter` and
`RawListing` so permitted sources (public job boards, company career pages,
campus boards, approved partner APIs) can be added without touching the UI.
`runSearch()` today ranks the local demo set and returns the same
`AiResult` shape a live implementation would.

`src/lib/store.tsx` keeps session, verification, onboarding, applications and
theme in one place. When a real account is signed in it reads and writes
through `/api/profile` to Postgres; without one it falls back to `localStorage`
so the prototype still runs with no database configured.

`db/migrations/` holds the schema and `npm run db:migrate` applies it
idempotently (`schema_migrations` tracks what has run).

## Accessibility

Contrast is measured, not guessed. Every text node on every route was audited
in both themes after the build; the dark theme reports zero nodes below its
WCAG threshold and the light theme's only remaining flags are white type over
the art-directed photographs. Focus is visible (`:focus-visible`), targets are
at least 40px, and `prefers-reduced-motion` disables the motion.

## Contributing & bounties

This project funds external contributors: 30 open bounty issues worth **$2,280**
in total ($50–$120 each) covering security fixes, payments correctness, tests,
accessibility, performance and DX. [`BOUNTIES.md`](./BOUNTIES.md) explains every
issue; [`CONTRIBUTING.md`](./CONTRIBUTING.md) covers the `/claim` workflow and
the review bar. Issues live at <https://github.com/Earnly-Build/earnly/issues>.

## Deploying

Built for Vercel and deployed at <https://earnly-app.vercel.app>. The OAuth
callback, database and session variables are set in the Vercel project (see
*Environment variables* above); no key lives in the repository.

Note: `earnly.vercel.app` is a different project owned by someone else — this
deployment answers on `earnly-app.vercel.app`, `earnly-student.vercel.app` and
`getearnly.vercel.app`.
