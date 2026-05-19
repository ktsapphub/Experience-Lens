# Test Credentials

## App user (existing, used for protected route testing)
- Email: `joseph@centurion-pm.com`
- Password: `#Test1234`

## Auth endpoints (FastAPI, all prefixed with `/api`)
- `POST /api/auth/register` → body `{ email, password }`, returns `{ access_token, user }`
- `POST /api/auth/login`    → body `{ email, password }`, returns `{ access_token, user }`
- `GET  /api/auth/me`       → requires `Authorization: Bearer <token>`, returns user

## Protected endpoints (require Bearer token)
- `GET /api/history`, `GET /api/history/{id}`, `DELETE /api/history/{id}`, `DELETE /api/history`
- `GET /api/search-history`
- `PUT /api/config/category`, `POST /api/config/reset`

## Frontend
- Token stored in `localStorage` under key `mdc_access_token`
- Axios interceptor attaches `Authorization: Bearer <token>` to all requests
- `/login` is the login + register page
- `/history` and `/config` are wrapped in `ProtectedRoute`; redirect to `/login` if no valid token
