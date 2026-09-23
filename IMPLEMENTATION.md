# Implementation — Sistem Keberadaan Staf SK Darau V1

## Delivery
- React + TypeScript + Vite frontend.
- Cloudflare Pages Functions API with a D1 binding named `DB`.
- GitHub repository deploys to the connected Cloudflare Pages project.
- No extra UI, database or authentication dependency.

## Public staff flow
1. Fetch active roster from `GET /api/staff`.
2. Submit one exception using `POST /api/exceptions`: staff ID, allowed status, ISO date.
3. Server validates data, applies a small D1 per-IP rate limit and creates one record per staff/date; duplicate public submit returns `409` without overwrite.
4. D1 trigger writes the immutable exception audit row in the same transaction.

## Admin flow
- `POST /api/admin/login` compares the shared PIN with Cloudflare secret `ADMIN_PIN` and issues a six-hour signed cookie using `SESSION_SECRET`.
- Authenticated admin can add/import roster names, correct an exception, see daily board and export/read a monthly summary.
- No deletion endpoint.

## D1 tables
- `staff` — ID, display name, active flag, timestamps.
- `exceptions` — one unique record per staff/date, status, create/update metadata.
- `audit_log` — append-only changes; exception audit is enforced by D1 triggers.
- `rate_limits` — IP + minute window counter.

## Required Cloudflare dashboard setup before the system can be live
1. Create D1 database and apply `migrations/0001_initial.sql`, then `migrations/0002_exception_audit_triggers.sql` in that order.
2. Bind it to Pages as `DB`.
3. Add encrypted secrets: `ADMIN_PIN` and a long random `SESSION_SECRET`.
4. Deploy the pushed GitHub branch.

## Acceptance checks
- Empty roster gives an admin onboarding prompt; no fake staff records are shipped.
- Public submit accepts only five statuses and a real active staff ID.
- Admin correction creates an audit record with the persisted exception ID.
- Monthly endpoint groups records by staff and status.
- Build/type checks and focused API unit tests pass locally before deployment.
