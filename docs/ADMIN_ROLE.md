# Admin account access

Implemented on `report-overhaul`; not deployed. Migration:
`supabase/migrations/20261113000000_admin_role_access.sql`, after the three earlier
report-overhaul migrations.

## Existing account compatibility

Admins use the normal Supabase account and existing `auth.users.id`. No columns
are added to Supabase's managed users table, no separate admin login is created,
and no existing account/password/token migration is needed.

Membership lives in `public.app_admins(user_id)`, whose UUID foreign key references
`auth.users(id)` with `ON DELETE CASCADE`. A user must already exist before being
assigned membership. The app never accepts `role`/`is_admin` values in editable
user metadata as authorization, and cannot write or enumerate this table.

## Assign and revoke manually

Use a privileged SQL session / the intended project's SQL Editor, substituting
an existing account UUID from Authentication > Users:

```sql
insert into public.app_admins(user_id)
values ('EXISTING_AUTH_USER_UUID')
on conflict (user_id) do nothing;
```

Revoke the role using the same UUID:

```sql
delete from public.app_admins
where user_id = 'EXISTING_AUTH_USER_UUID';
```

Deleting an account also removes its membership. No accounts have been assigned
admin privileges by this implementation.

## App and server enforcement

`get_my_admin_status()` is an authenticated, no-argument boolean RPC. It checks
only the current `auth.uid()` against membership. It cannot look up another
account or return a list of admins. Anonymous callers cannot execute it.

The app checks on login, foreground resume, token refresh, and every 60 seconds
while active. Profile has a manual Refresh account access button. Admins see an
Administrator access label and an Admin navigation tab. The tab opens the admin queue, recent reports, and exact-ID lookup. The subsequent
[moderation layer](ADMIN_MODERATION.md) adds confirmed decisions, box editing,
publication/rejection, and audit history through versioned server operations.

Permission responses from a prior account, superseded requests, and unmounted
sessions are ignored. Errors, offline requests, malformed responses, and signed-
out/preview sessions do not grant access. The app rechecks before opening the
admin screen and fetching the sensitive queue. Losing access unmounts that screen
and removes the tab; foreground UI role updates can lag revocation by up to the
60-second refresh interval.

Every admin database operation and queue/photo read independently checks the
current database membership. Revocation therefore blocks subsequent protected
server requests without requiring logout or token refresh, even if the app still
briefly displays previously loaded content. Hiding a tab is not the authorization
boundary. No service-role credentials are shipped to the app.

## Validation

- `tests/admin-role-access.sql` applies the complete migration chain with existing
  users, verifies the UUID foreign key, rejects unknown accounts/self-promotion,
  ignores spoofed profile metadata, and checks assignment/revocation using the
  same authenticated UUID. It verifies queue/audit/mutation access after
  revocation and role cleanup on user deletion. Disposable database only; rollback.
- `tests/admin-access.test.mjs` covers explicit boolean authorization, malformed
  and failed responses, account-switch races, revocation races, and unmounts.
- App type checking and web production export verify integration. The SQL suite
  is included in CI alongside the five existing database suites.

A live walkthrough with an assigned beta account still needs the migrations
applied and the matching client deployed. The shared database remains unchanged.
