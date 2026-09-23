# Implementation — Sistem Keberadaan Staf SK Darau V1

## Delivery
- React + TypeScript + Vite frontend.
- Cloudflare Pages Functions API with a D1 binding named `DB`.
- GitHub repository deploys to the connected Cloudflare Pages project.
- No extra UI, database or authentication dependency.

## Public staff flow
1. Fetch active roster from `GET /api/staff`.
2. Submit one attendance record using `POST /api/exceptions`: staff ID, allowed status, ISO date.
3. Server validates data, applies a small D1 per-IP rate limit and creates one record per staff/date; duplicate public submit returns `409` without overwrite.
4. D1 trigger writes the immutable exception audit row in the same transaction.
5. `GET /api/dashboard?date=YYYY-MM-DD` displays daily staff name, status and date to all staff; it has no edit or deletion operation.
6. Staff can tap a displayed name for a read-only Hero Card; status filters and name search run locally on the already-read daily board.

## Admin flow
- `POST /api/admin/login` compares the shared PIN with Cloudflare secret `ADMIN_PIN` and issues a six-hour signed cookie using `SESSION_SECRET`.
- Authenticated admin can add/import roster names, edit attendance records, see a daily board that refreshes every 15 seconds, view a CSS-native monthly status chart, download the full current daily board as UTF-8 Excel-compatible CSV, or use browser Print → Save as PDF.
- CSV export covers all loaded records for the selected date, not merely a search/filter subset, and escapes formula-leading values before download.
- Only authenticated admin can call `DELETE /api/admin/exceptions/:id`; the database builds one `EXCEPTION_DELETED` audit row from the persisted record in the same D1 batch before deletion.

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
- Admin deletion requires an authenticated session; concurrent requests produce at most one deletion and one `EXCEPTION_DELETED` audit row.
- Monthly endpoint groups records by staff and status; admin UI also renders a native status-bar summary.
- Public Hero Card/filter/search have no mutation controls; CSV and Print/PDF actions are admin-only.
- Build/type checks, focused API unit tests and the desktop/mobile browser harness pass locally before deployment.
