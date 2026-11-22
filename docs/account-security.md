# Account security and audit log

## Account page

Reached from the account menu (your email, at the end of the navigation bar) → « Mon compte » (`/account`).

- **E-mail address**: the login address can be changed with the current password. It is normalised (trimmed, lowercase) and must be unused; no confirmation e-mail is sent. Every other session is closed. The addresses are not written to the audit log. Sending-profile test e-mails go to this address.
- **Password**: the current password is required, and the new one must be at least 12 characters long. After the change, every other session of the account is closed.
- **Active sessions**: list of sessions (truncated User-Agent, opened, last activity). Any session other than the current one can be revoked, or all of them at once. The IP address is never stored.
- Actions that check a secret (password, code) are limited to 5 attempts per 15 minutes per account.

## Two-factor authentication (TOTP)

- RFC 6238: HMAC-SHA1, 6 digits, 30-second step, ±1 step tolerance. Implemented on `node:crypto`, with no dependency. A code that was already accepted cannot be replayed (the last step is stored).
- Enrolment: a QR code (`otpauth://`) is rendered server-side as SVG and served as a `data:` URI, compatible with the strict CSP (`img-src 'self' data:`). A manual key is also shown. 2FA is only enabled once a first code has been confirmed. The QR code is produced by [`uqr`](https://github.com/unjs/uqr) (MIT, no dependency).
- The secret is **encrypted** in the database (AES-256-GCM, key derived from `REDFISH_SECRET_KEY`, like SMTP passwords). Changing that key makes TOTP secrets unreadable: operators must then enrol again.
- Eight recovery codes (80 bits each) are shown only once. Only their SHA-256 hash is stored; each code is consumed atomically (single use).
- Login: after a valid password, a second-step cookie (5 minutes, `SameSite=Strict`, path `/login`) leads to `/login/2fa`. The step is lost after 5 wrong codes, and input is limited to 5 attempts per 15 minutes per IP and per account.
- Unreadable secret: if `REDFISH_SECRET_KEY` changed, the TOTP secret can no longer be decrypted. The login step does not fail with a 500: the server logs a clear error (no secret material) and the user is told, in French, to use a recovery code or ask a superadmin. Recovery codes are SHA-256 hashed (not encrypted), so they keep working.
- Superadmin reset: superadmins can reset another user's 2FA from `/users` (disables 2FA, deletes recovery codes, challenges and sessions of that account; audit action `auth.2fa.reset`). The user can then re-enrol from the Account page.
- Disabling: both the password **and** a code (TOTP or recovery) are required.

## Audit log

Table `audit_log`: date, actor (id and frozen email), organization, action, object and JSON details. Written in one line from actions: `audit(user, 'campaign.launch', { tenantId, targetType, targetId })`. A failed write is reported in the logs without cancelling the action.

Logged actions: successful or failed login (the email typed is never written), recovery code used, password changed, sessions revoked, 2FA enabled or disabled, client created, updated or deleted, scenario created or imported, sending profile created, campaign created, authorized, scheduled, sending pace changed, launched or deleted, targets imported or added, anonymisation by retention. The identifiers `scenario.delete`, `campaign.cancel` and `sending_profile.update`/`delete` are reserved for actions that do not exist in the interface yet.

The `/audit` page (« Administration » menu → « Journal d'audit »; read-only, filters by action group, actor, organization and dates, 50 entries per page) is reserved for superadmins. The `operator` role has no administration rights, so there is no view limited to one organization.

Retention: see [retention-backup.md](retention-backup.md).
