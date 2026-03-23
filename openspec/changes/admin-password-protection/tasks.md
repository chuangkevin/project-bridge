## 1. Server — Auth Middleware

- [x] 1.1 Add `requireAuth` middleware in settings.ts
- [x] 1.2 Check `admin_password_hash` from DB settings; allow if not set (first-time setup)
- [x] 1.3 Validate Bearer token with HMAC-SHA256 + expiry
- [x] 1.4 Apply middleware to all `/api/settings` routes

## 2. Server — Auth Endpoints

- [x] 2.1 `POST /api/settings/auth/setup` — set initial password (only if none exists)
- [x] 2.2 `POST /api/settings/auth/login` — verify password, return signed token
- [x] 2.3 `POST /api/settings/auth/change-password` — change password (requires old password)

## 3. Client — Auth Flow in SettingsPage

- [x] 3.1 On load: check if password is set (`GET /api/settings/api-keys` — 401 or 403)
- [x] 3.2 If no password: show setup form
- [x] 3.3 If password set: show login form
- [x] 3.4 Store token in sessionStorage after login
- [x] 3.5 Show change-password section in authenticated view

## 4. Token Management UI

- [x] 4.1 API key table: key suffix, today calls, total calls/tokens, delete button
- [x] 4.2 Add key form with validation via test call
- [x] 4.3 Token usage summary cards (today / 7d / 30d)
- [x] 4.4 Model selector dropdown

## 5. Database

- [x] 5.1 Migration 018: `api_key_usage` table with indexes
