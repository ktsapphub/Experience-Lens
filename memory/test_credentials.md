# Test credentials

Credentials are no longer stored in the repository (the previous version of this file contained
plaintext account passwords: treat those passwords as compromised and rotate them).

- Production/staging admin: set the `ADMIN_EMAIL` and `ADMIN_PASSWORD` Worker secrets (see `.hub/launch.json`).
  The Worker creates or updates that account on the first request after the secrets change.
- Local development: put test values in `.dev.vars` (gitignored). See README.
- Smoke test: `SMOKE_URL`, `SMOKE_EMAIL`, `SMOKE_PASSWORD` environment variables (`tests/smoke.test.js`).
