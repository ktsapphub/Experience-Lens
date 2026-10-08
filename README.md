# Experience Lens

Search Google Places by experience category (thrill seeking, super chill, creative, pure entertainment, foodie),
enrich results (Instagram handles, AI descriptions, short links), and export them as CSV.

Runs as **one Cloudflare Worker**: the React frontend is served as static assets and the API lives under `/api`
on the same origin (no CORS, no backend URL). Data is in Cloudflare D1.

| Environment | URL | Worker | D1 database |
|---|---|---|---|
| Production | https://experiencelens.ktsapps.com | `experiencelens` | `experiencelens-db` |
| Staging | https://experiencelens-staging.ktsapps.com | `experiencelens-staging` | `experiencelens-staging-db` |

## Layout

```
wrangler.jsonc        Worker config: assets, routes, vars, D1, rate limiting, staging env
worker/               API (fetch handler, no framework): index.js router, auth.js, places.js, integrations.js
frontend/             React (CRA + craco, Tailwind, shadcn/ui); build output frontend/build is the assets dir
tests/                node:test suites (parity, API behaviour, smoke) + fixtures
backend/              LEGACY FastAPI/Mongo code, kept only as the parity-test reference. Not deployed.
.hub/launch.json      Secrets and launch checks the Mission Control hub reads after merge
```

## Run locally

```bash
npm install                      # wrangler
                                 # create .dev.vars with the values below
npm run dev                      # builds the frontend, serves Worker + assets on http://localhost:8787
```

`.dev.vars` (gitignored):

```
JWT_SECRET=<32+ random characters>
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=<password>
GOOGLE_PLACES_API_KEY=<key>      # optional locally: search returns 500 without it
```

Local D1 is a SQLite file under `.wrangler/`; tables are created on the first request.

## Tests

```bash
npm test                                                   # parity + API behaviour (no network, no wrangler)
SMOKE_URL=http://localhost:8787 npm test                   # also smoke-test a running Worker (staging/prod URLs work too)
```

- `tests/parity.test.js` compares the Worker with output recorded from the original FastAPI code
  (`tests/fixtures/expected.json`): search results/pagination/dedupe/interleave, validation messages, Instagram parsing,
  **byte-identical CSV**, config/categories/regions. Regenerate fixtures with `python3 tests/generate_expected.py`
  (needs the packages listed in that file).
- `tests/api.test.js` covers auth, authorization, input validation, error codes, CORS, rate-limit-free paths, caps.

## Configuration

Secrets are Worker secrets, never in code (`npx wrangler secret put NAME [--env staging]`); the hub sets them from
`.hub/launch.json`.

| Name | Kind | Required | Purpose |
|---|---|---|---|
| `JWT_SECRET` | secret | yes | Token signing, 32+ chars, different per environment |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | secret | yes | Admin account, created/updated on first request |
| `GOOGLE_PLACES_API_KEY` | secret | yes | Places API (New); stays server-side (photos go through `/api/places/photo`) |
| `SHORTIO_API_KEY`, `SHORTIO_DOMAIN` | secret | no | Link shortening |
| `GEMINI_API_KEY` | secret | no | AI descriptions (replaces the old Emergent LLM key) |
| `ALLOW_REGISTRATION` | var | no | `"true"` enables self-service sign-up (default `"false"`) |
| `SUBREQUEST_BUDGET` | var | no | Outbound requests per API call (default 40; free plan limit 50) |
| `CORS_ORIGINS` | var | no | Extra origins allowed to call the API with credentials (default none) |

## Deploy

Deploys are done by the repo's **Mission Control Deploy** workflow, not by hand:

- push/merge to `main` → `wrangler deploy` (production)
- push to `staging` → `wrangler deploy --env staging`

The build (`npm run build`) installs and builds the frontend; the D1 databases are created by name on first deploy.
Custom domains (`*.ktsapps.com`) are created by the deploy. Never edit DNS by hand.

## API (same routes and shapes as the old backend)

Public: `GET /api/`, `/api/config`, `/api/categories`, `/api/regions`, `POST /api/places/search`,
`POST /api/places/export-csv`, `GET /api/places/photo`, `POST /api/auth/login|register|logout`.
Signed-in: `/api/auth/me`, `/api/history*`, `/api/search-history`, `/api/generate-descriptions`,
`/api/shorten-links`, `/api/shorten-status`, `/api/status`. Admin: `PUT /api/config/category`, `POST /api/config/reset`,
`DELETE /api/history`, `GET /api/users`.
Errors are `{ "detail": "<message>" }` with 400/401/403/404/405/413/422/429/500/502.

### Behaviour changes vs. the old backend (all security-driven)

- Passwords: PBKDF2-SHA256 instead of bcrypt (WebCrypto). The old Mongo users are **not** migrated; the admin is
  re-created from `ADMIN_EMAIL`/`ADMIN_PASSWORD`, others re-register (if enabled).
- Self-registration is off by default; config edits, clearing history and listing users are admin-only.
- `shorten-links`, `generate-descriptions`, `shorten-status` and `status` now require sign-in (they spend paid quota or
  write to the owner's short.io domain). Search and CSV export stay public but rate-limited.
- Photo URLs in search results are same-origin `/api/places/photo?name=…`; the Google key never reaches the browser.
- CSV cells starting with `= + - @` in name/address/description are prefixed with `'` (formula-injection guard).
- Category config edits persist in D1 and are applied on every request (the old API only held them in memory).

### Workers limits

Free plan: 50 subrequests and 10 ms CPU per request. Search budgets its Google queries (~60%) and Instagram scrapes
(the rest) inside `SUBREQUEST_BUDGET`; CSV export resolves up to that many photo URLs (the rest stay as absolute
`/api/places/photo` links); shortener and description batches are capped (frontend chunks 25 / 6). PBKDF2 (100k
iterations, the Workers maximum) is CPU-heavy: login/register may need the **Workers Paid plan** (~$5/mo) to be
reliable. Raise `SUBREQUEST_BUDGET` there for fuller Instagram coverage.
