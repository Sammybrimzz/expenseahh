# Account-based personal ledgers

## Build
- Add an account screen with email/password sign-up and sign-in, plus Google sign-in; keep the expense tracker behind sign-in and provide sign-out.
- Store each signed-in person's complete monthly ledger in Lovable Cloud, protected so only that account can read or change it.
- On the first account that signs in on an existing device, offer its old locally saved ledger to become that account's cloud ledger; do not copy local data into later accounts. Keep the device cache scoped to the signed-in account.
- Preserve the existing tracker and reports, then verify account separation, persistence, and the main expense flow.

## Technical details
- Add one JSON ledger row per account with row-level security and authenticated-only grants.
- Use the existing browser auth/data client; configure managed Google sign-in and keep email confirmation enabled.
- Store no additional profile fields. Avoid copying an existing device ledger into an account that already has cloud data.
