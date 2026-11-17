-- Migration 12: users deleted before migration 11 (issue #34, PR #57 review).
-- The on_auth_user_deleted trigger only covers deletes after migration 11. A public.users row whose
-- auth user was deleted earlier still blocks a new sign-up with that email (handle_new_user inserts
-- with "on conflict do nothing"), so every counted action answers 503. Remove those rows once.
-- Their usage rows, watchlist and research runs go with them through the cascades of migration 11.
-- On the project database on 2026-11-17 this matched 0 rows.
delete from public.users u where not exists (select 1 from auth.users a where a.id = u.id);
