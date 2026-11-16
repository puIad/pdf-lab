-- Migration 11: account deletion, and limits that hold under simultaneous requests
-- (issues #34, #35, #36).

-- #34: deleting an auth user removes its public.users row, and with it the person's usage rows,
-- watchlist and research runs (a run's markets, opportunities and competitors go with the run).
-- Before this the row stayed, the unique email blocked the row of a new sign-up with the same
-- address, and every counted action answered 503.
alter table research_runs drop constraint research_runs_user_id_fkey;
alter table research_runs add constraint research_runs_user_id_fkey
  foreign key (user_id) references users(id) on delete cascade;

create function public.handle_deleted_user() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  delete from public.users where id = old.id;
  return old;
end $$;
revoke execute on function public.handle_deleted_user() from public, anon, authenticated;

create trigger on_auth_user_deleted after delete on auth.users
  for each row execute function public.handle_deleted_user();

-- #35: count and record one action in one step. The lock makes one caller's checks for one kind
-- run one at a time, so two requests at the limit cannot both pass.
-- Returns the new row's id, or null when the limit is reached, with the count after the call.
create function public.take_usage(p_user_id uuid, p_anon_hash text, p_kind text, p_since timestamptz, p_max int)
  returns table (usage_id uuid, used int)
  language plpgsql set search_path = '' as $$
declare
  v_used int;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('usage:' || coalesce(p_user_id::text, p_anon_hash) || ':' || p_kind, 0));
  select count(*) into v_used from public.usage_events e
    where e.kind = p_kind and e.created_at >= p_since
      and ((p_user_id is not null and e.user_id = p_user_id) or (p_user_id is null and e.anon_hash = p_anon_hash));
  if v_used >= p_max then
    return query select null::uuid, v_used;
    return;
  end if;
  insert into public.usage_events (user_id, anon_hash, kind)
    values (p_user_id, case when p_user_id is null then p_anon_hash end, p_kind)
    returning id into v_id;
  return query select v_id, v_used + 1;
end $$;
revoke execute on function public.take_usage(uuid, text, text, timestamptz, int) from public, anon, authenticated;
grant execute on function public.take_usage(uuid, text, text, timestamptz, int) to service_role;

-- #36: the watchlist cap is checked in the statement that inserts. The cap comes from the server
-- (lib/quotas/quotas.ts), so a signed-in person no longer inserts rows directly: that path had no
-- cap at all.
create function public.add_watch(p_user_id uuid, p_kind text, p_ref text, p_region text, p_seed text, p_limit int)
  returns table (status text, total int)
  language plpgsql set search_path = '' as $$
declare
  v_total int;
begin
  perform pg_advisory_xact_lock(hashtextextended('watch:' || p_user_id::text, 0));
  select count(*) into v_total from public.watchlists w where w.user_id = p_user_id;
  if exists (select 1 from public.watchlists w
             where w.user_id = p_user_id and w.kind = p_kind and w.ref = p_ref and w.region = p_region) then
    return query select 'exists'::text, v_total;
    return;
  end if;
  if v_total >= p_limit then
    return query select 'full'::text, v_total;
    return;
  end if;
  insert into public.watchlists (user_id, kind, ref, region, seed) values (p_user_id, p_kind, p_ref, p_region, p_seed);
  return query select 'added'::text, v_total + 1;
end $$;
revoke execute on function public.add_watch(uuid, text, text, text, text, int) from public, anon, authenticated;
grant execute on function public.add_watch(uuid, text, text, text, text, int) to service_role;

drop policy "owner adds to watchlist" on watchlists;
revoke insert on watchlists from authenticated;
