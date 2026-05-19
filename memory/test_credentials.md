# Test Credentials

## App user (existing, used for protected route testing)
- Email: `joseph@centurion-pm.com`
- Password: `#Test1234`

## Running the pytest suite
The auth tests (`/app/backend/tests/test_auth.py`) read credentials from environment variables to keep secrets out of VCS:

```
TEST_USER_EMAIL=joseph@centurion-pm.com TEST_USER_PASSWORD='#Test1234' \
  pytest /app/backend/tests/test_auth.py
```

If those vars are not set the test module is skipped.

## Auth endpoints (FastAPI, all prefixed with `/api`)
- `POST /api/auth/register` → body `{ email, password }`. Returns `{ access_token, user }`. **Sets httpOnly cookie `mdc_access_token`.**
- `POST /api/auth/login`    → body `{ email, password }`. Returns `{ access_token, user }`. **Sets httpOnly cookie.**
- `POST /api/auth/logout`   → clears the cookie.
- `GET  /api/auth/me`       → returns user. Auth is read from cookie first, then `Authorization: Bearer <token>` (test/API clients).

## Protected endpoints (require auth)
- `GET /api/history`, `GET /api/history/{id}`, `DELETE /api/history/{id}`, `DELETE /api/history`
- `GET /api/search-history`
- `PUT /api/config/category`, `POST /api/config/reset`

## Frontend
- Auth token is **never** stored in `localStorage` (XSS-resistant).
- Browser-side flow uses an httpOnly cookie set by the backend; axios is configured with `withCredentials: true` so the cookie is sent automatically.
- `/login` is the login + register page.
- `/history` and `/config` are wrapped in `ProtectedRoute`; redirect to `/login` if `/auth/me` returns 401.
